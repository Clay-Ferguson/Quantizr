import { ReactNode, createElement, createRef, forwardRef, useEffect, useLayoutEffect } from "react";
import { Constants as C } from "../../Constants";
import { S } from "../../Singletons";
import { State } from "../../State";

export type Attribs = { [k: string]: any };


/* Base class for all components which encapsulates a lot of React functionality so that our
implementation code can ignore those details. */
export abstract class Comp {
    private parent: Comp = null; // only used for debug logging (can be deleted without impacting app)
    static renderCounter: number = 0;
    static focusElmId: string = null;
    public debug: boolean = false;
    public mounted: boolean = false;
    public rendered: boolean = false;

    // tag can be a string *or* a react functional component
    public tag: any;
    public content: string = null;

    private static guid: number = 0;

    // this option allows the ability to use the DOM explorer in browsers to see the class name of
    // every element
    private static renderClassInDom: boolean = false;

    // this is a global flag for overriding/disabling scroll setting which we need to do in some
    // cases.
    static allowScrollSets = true;

    attribs: any;

    /** 
     * Note: NULL elements are allowed in this array and simply don't render anything, and are
     * required to be tolerated and ignored WARNING: TypeScript is NOT enforcing that children be
     * private here.
     */
    public children: any[];

    // holds queue of functions to be ran once this component exists in the DOM.
    domAddFuncs: ((elm: HTMLElement) => void)[];

    // default all these to null so that unless derived class sets the value we never need to create
    // some of the useEffect calls
    public domPreUpdateEvent: React.EffectCallback = null;
    public domUpdateEvent: React.EffectCallback = null;
    public domRemoveEvent: React.EffectCallback = null;
    public domAddEvent: () => void = null;

    public preRenderRejected: boolean = false;
    public ordinal: number;

    // DO NOT DELETE (#monitor-lifecycle)
    // static allCompIds: Set<string> = new Set<string>();

    constructor(attribs?: any, private stateMgr?: State<any>) {
        if (typeof attribs === "string") {
            throw new Error("string was passed for 'attribs' in " + this.constructor.name);
        }
        if (Array.isArray(attribs)) {
            throw new Error("array was passed for 'attribs' in " + this.constructor.name);
        }

        if (this.debug) {
            console.log("construct: " + this.constructor.name);
        }
        this.attribs = attribs || {};
        this.attribs.ref = createRef();

        if (this.attribs.title) {
            this.attribs.title = "Tip:\n\n" + this.attribs.title;
        }

        // for debugging, shows classname in every dom element as an attribute.
        if (Comp.renderClassInDom) {
            // if 'c' property not defined from a higher level up define it here as class name
            if (!this.attribs.c) {
                this.attribs.c = this.constructor.name;
            }
        }
        else {
            // components can specify 'c' (to name a generic Div for example), and if not needed we
            // remove it here.
            if (this.attribs.c) {
                delete this.attribs.c;
            }
        }

        // Note: I used to pass a 36 into the toString method to get a 36-based number, but I decided since this code
        // needs to be as fast as possible, I would just use the default base 10 number and not worry about the extra memory consumed
        this.attribs.id = this.attribs.id || (++Comp.guid).toString();
        this.attribs.key = this.attribs.key || this.attribs.id;
    }

    /* Not currently used, but let's keep this */
    public getRefAsync = (_warn: boolean = true): Promise<HTMLElement> => {
        return new Promise<HTMLElement>((resolve, _reject) => {
            const elm = this.getRef();

            // if we have element already, resolve with it, we're done
            if (elm) {
                resolve(elm);
            }
            else return S.domUtil.getElm(this.getId());
        });
    }

    public getRef = (): HTMLElement => {
        if (this.preRenderRejected) {
            // console.warn("getRef was called on id " + this.getId() + " (class: " +
            // this.getCompClass() + ") which will return null because of preRenderRejected");
            return null;
        }

        let ret = null;
        if (this.attribs.ref) {
            // Not sure if isConnected is needed here.
            ret = this.attribs.ref.current?.isConnected ? this.attribs.ref.current : null;
        }
        return ret;
    }

    getId(): string {
        return this.attribs.id;
    }

    getCompClass = (): string => {
        return this.constructor.name + "_" + this.getId();
    }

    /* Schedules a function to get run whenever this element comes into existence, or will cause the
     function to run immediately if the component is already mounted */
    onMount(func: (elm: HTMLElement) => void) {
        if (!func) return;
        // If we happen to already have the ref, we can run the 'func' immediately and be done or
        // else we add 'func' to the queue of functions to call when component does get mounted.
        const elm = this.getRef();
        if (elm) {
            this.runQueuedFuncs(elm); // <-- new 7/20/24, just because this seems right, not to fix any problmes.
            func(elm);
            return;
        }

        if (this.debug) {
            console.log("queueing onMount function on " + this.getCompClass());
        }

        // queue up the 'func' to be called once the domAddEvent gets executed.
        this.domAddFuncs = this.domAddFuncs || [];
        this.domAddFuncs.push(func);
    }

    setClass(clazz: string): void {
        this.attribs.className = clazz;
    }

    insertFirstChild(comp: any): void {
        if (!comp) return;
        this.children = this.children || [];
        this.children.unshift(comp);
    }

    addChild(comp: any): void {
        if (!comp) return;
        this.children = this.children || [];
        this.children.push(comp);
    }

    addChildren(comps: any[]): void {
        if (!comps || comps.length === 0) return;
        this.children = this.children || [];
        this.children.push.apply(this.children, comps);
    }

    /* Returns true if there are any non-null children */
    hasChildren(): boolean {
        return !!this.content || this.children?.some(child => !!child);
    }

    // We take an array of 'any', because some of the children may be strings.
    private createChildren(children: any[]): ReactNode[] {
        if (!this.content && (!children || children.length === 0)) {
            if (this.debug) console.log("createChildren: no children for " + this.getCompClass());
            return null;
        }

        let arr = this.content ? [this.content] : [];
        if (children) {
            arr = children.reduce((acc: any[], child: any) => {
                if (child instanceof Comp) {
                    try {
                        child.parent = this; // only done for debugging.
                        acc.push(createElement(child.render, child.attribs));
                    }
                    catch (e) {
                        S.util.logErr(e, "Failed to render child " + child.getCompClass() + " attribs.key=" + child.attribs.key);
                    }
                } else if (child) {
                    if (child === this.content) {
                        console.error("child is same as content, skipping: " + child);
                    }
                    acc.push(child);
                }
                return acc;
            }, arr);
        }
        return arr;
    }

    focus(): void {
        // immediately assign this as the focused element ID
        Comp.focusElmId = this.getId();

        this.onMount(() => {
            // if we're still the focused id, then we do the focus, but due to async nature some
            // other thing could have technically taken over focus and we might do nothing here.
            if (Comp.focusElmId === this.getId()) {
                S.domUtil.focusId(Comp.focusElmId);
            }
        });
    }

    public static getDangerousHtml = (content: string) => {
        return { __html: S.domUtil.sanitizeHtml(content) };
    }

    /* Renders this node to a specific tag, including support for non-React children Note: Tag can
    also be a type here, not just a string.
    */
    reactNode = (type: any): ReactNode => {
        let ret: ReactNode = null;

        // If this is a raw HTML component just render using 'attribs', which is what react expects.
        if (this.attribs.dangerouslySetInnerHTML) {
            ret = createElement(type, this.attribs);
        }
        else {
            try {
                const children = this.createChildren(this.children);

                if (this.debug)
                    console.log("reactNode: " + this.getCompClass() + " childCount=" + children?.length);

                if (children?.length == 1) {
                    ret = createElement(type, this.attribs, children[0]);
                }
                else if (children?.length > 0) {
                    ret = createElement(type, this.attribs, children);
                }
                else {
                    ret = createElement(type, this.attribs);
                }
            }
            catch (e) {
                S.util.logErr(e, "Failed in Comp.tagRender" + this.getCompClass() + " attribs=" + S.util.prettyPrint(this.attribs));
            }
        }
        return ret;
    }

    // add type argument here (not 'any')
    checkState = (): boolean => {
        if (!this.stateMgr) {
            if (!this.rendered) {
                // we allow a lazy creation of a State as long as component hasn't rendered yet.
                // This is because the 'useState' can only be called inside the render method due to
                // the "Rules of Hooks". The normal pattern is that a component will call mergeState
                // in the constructor to initialize some state
                this.stateMgr = new State<any>(null);
            }
            else {
                console.error("non-state component " + this.getCompClass() + " attempted to use stateMgr, after renderd");
                return false;
            }
        }
        return true;
    }

    mergeState<T>(moreState: T): void {
        if (!this.checkState()) return;
        this.stateMgr.mergeState(moreState);
    }

    setState = <T>(newState: T) => {
        if (!this.checkState()) return;
        this.stateMgr.setState(newState);
    }

    getState<T>(): T {
        if (!this.checkState()) return null;
        return this.stateMgr.state;
    }

    // Core 'render' function used by react. This is THE function for the functional component this
    // object represents
    renderCore = (_props, _ref): any => {
        this.rendered = true;

        try {
            if (this.stateMgr) {
                this.stateMgr.useState();
            }

            // This 'useEffect' with the empty dependency array (last param) is essentially the
            // 'componentDidMount' effect, and our app maps this to calling the 'domAddEvent'
            useEffect(() => {
                // Supposedly React 18+ will call useEffect twice on a mount (in strict mode, at
                // least) so that's the only reason we're checking for !mounted here in this if
                // condition.
                if (!this.mounted) {
                    this.mounted = true;
                    // because of the empty dependencies array in useEffect this only gets called
                    // once when the component mounts.
                    this.domAdd();
                    if (this.domAddEvent) this.domAddEvent(); // call overridable method.

                    if (this.getScrollPos() !== null) {
                        this.scrollDomAddEvent();
                    }
                }

                // the return value of the useEffect function is what will get called when component
                // unmounts, and was in the original pre-hooks React analogous to
                // 'compnentWillUnmount'
                return () => {
                    this.mounted = false;
                    if (this.domRemoveEvent) this.domRemoveEvent();

                    // DO NOT DELETE (#monitor-lifecycle)
                    // Comp.allCompIds.delete(this.getId());
                };
            }, []);

            // Note: The useEffect with no array as second parameter (dependencies) is how we
            // capture an update event for all state changes.
            if (this.domUpdateEvent) useEffect(this.domUpdateEvent);
            if (this.domPreUpdateEvent) useLayoutEffect(this.domPreUpdateEvent);

            if (this.getScrollPos() !== null) {
                useLayoutEffect(this.scrollDomPreUpdateEvent);
            }

            Comp.renderCounter++;
            if (this.debug) {
                console.log("render: " + this.getCompClass() + " counter=" + Comp.renderCounter + " ID=" + this.getId());
            }

            if (this.preRender && this.preRender() === false) {
                this.preRenderRejected = true;
                if (this.debug)
                    console.log("preRender Rejected: " + this.getCompClass());
                return null;
            }
            const ret = this.compRender();

            // if (this.debug) { // console.log("render done: " + this.getCompClass() + " counter="
            //     + Comp.renderCounter + " ID=" + this.getId());
            // }
            return ret;
        }
        catch (e) {
            S.util.logErr(e, "Failed to render child (in render method) " + this.getCompClass() + " attribs.key=" + this.attribs.key + "\nError: " + e +
                "\nELEMENTS Stack: " + this.getAncestry());
            return null;
        }
    }

    // Note: forwardRef is a wrapper around the render method, so we can have 'ref' in the attribs.
    // If we didn't need 'ref' we could have just use the render core method directly.
    // eslint-disable-next-line
    render = forwardRef((props, ref) => {
        return this.renderCore(props, ref);
    });

    /* Get a printable string that contains the parentage of the component as far as we know it back
    to the root level */
    getAncestry() {
        let stack = "";
        let comp: Comp = this;
        while (comp) {
            stack = comp.getCompClass() + (stack ? " / " : "") + stack;
            comp = comp.parent;
        }
        return stack;
    }

    private domAdd = (): void => {
        // DO NOT DELETE (#monitor-lifecycle)
        // Comp.allCompIds.add(this.getId());

        // console.log("domAddEvent: " + this.getCompClass());
        const elm = this.getRef();
        if (!elm) {
            return;
        }
        this.maybeFocus();
        this.runQueuedFuncs(elm);
    }

    maybeFocus = () => {
        /* React can loose focus so we manage that state ourselves using Comp.focusElmId */
        if (Comp.focusElmId && this.attribs.id === Comp.focusElmId) {
            S.domUtil.focusId(Comp.focusElmId);
        }
    }

    runQueuedFuncs = (elm: HTMLElement) => {
        if (!this.domAddFuncs) return;
        this.domAddFuncs.forEach(func => func(elm));
        this.domAddFuncs = null;
    }

    /* Intended to be optionally overridable to set children, and the ONLY thing to be done in this
    method should be just to set the children. To indicate to NOT render the component at all return
    false from this method */
    preRender: () => boolean

    // This is the function you override/define to implement the actual render method, which is
    // simple and decoupled from state management aspects that are wrapped in 'render' which is what
    // calls this, and the ONLY function that calls this.
    compRender = (): ReactNode => {
        return this.reactNode(this.tag || "div");
    }

    scrollDomAddEvent = () => {
        if (C.DEBUG_SCROLLING) {
            console.log("scrollDomAddEvent: " + this.getCompClass());
        }
        const elm = this.getRef();
        if (elm) {
            if (Comp.allowScrollSets) {
                elm.scrollTop = this.getScrollPos();
            }

            elm.addEventListener("scroll", () => {
                if (C.DEBUG_SCROLLING) {
                    console.log("Scroll Evt [" + this.getCompClass() + "]: elm.scrollTop=" + elm.scrollTop);
                }
                this.setScrollPos(elm.scrollTop);
            }, { passive: true });
        }
    }

    scrollDomPreUpdateEvent = () => {
        if (!Comp.allowScrollSets) return;
        const elm = this.getRef();
        if (elm) {
            if (C.DEBUG_SCROLLING) {
                console.log("scrollDomPreUpdateEvent [" + this.getCompClass() + "]: elm.scrollTop=" + elm.scrollTop + " elm.scrollHeight=" + elm.scrollHeight);
            }
            elm.scrollTop = this.getScrollPos();
        }
    }

    /* If a component wants to persist it's scroll position across re-renders, all that's required
     is to override the getScrollPos and setScrollPos, being sure to use a backing variable that is
     NOT component-scoped (or it could be static var on the component if there's always only one
     such component to ever exist, as is the case for example with the LHS panel (menu) or RHS
     panels of the main app layout) Returning null from getScrollPos (the default behavior of this
     base class) indicates to NOT do any scroll persistence.

     WARNING: Be sure to actually have these methods on the same DOM Element that has the scrollbar
     itself (normally customScrollBar class), or else it won't work!
     */
    getScrollPos = (): number => {
        return null;
    }

    setScrollPos = (_pos: number): void => {
    }

    /* Components should call this method instad of setting scrollTop directly on an element */
    setScrollTop = (pos: number): void => {
        // if this returns null it means we're not persisting scrolling in this comp and we skip
        // that logic.
        if (this.getScrollPos()) {
            this.setScrollPos(pos);
        }

        const elm = this.getRef();
        if (elm) {
            if (C.DEBUG_SCROLLING) {
                console.log("setScrollTop [" + this.getCompClass() + "]: elm.scrollTop=" + pos + " elm.scrollHeight=" + elm.scrollHeight);
            }
            elm.scrollTop = pos;
        }
    }

    // There are a few very special places where we need to sort components that may have been added
    // in an order we don't want this this is how we do it.
    ordinalSortChildren = () => {
        this.children?.sort((a, b) => a.ordinal - b.ordinal);
    }
}

/* We have a wrapper class around this single value so we can pass by reference and store the actual
value in a higher level object, and not have to worry about the value being out of sync. */
export class ScrollPos {
    scrollPos: number = 0;

    getVal = (): number => {
        return this.scrollPos;
    }

    setVal = (p: number): void => {
        this.scrollPos = p;
    }
}
