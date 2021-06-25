// https://reactjs.org/docs/react-api.html
// https://reactjs.org/docs/hooks-reference.html#usestate
// #RulesOfHooks: https://fb.me/rules-of-hooks

import { createElement, ReactElement, ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import * as ReactDOM from "react-dom";
import { renderToString } from "react-dom/server";
import { Provider } from "react-redux";
import { store } from "../../AppRedux";
import { Constants as C } from "../../Constants";
import { PubSub } from "../../PubSub";
import { Singletons } from "../../Singletons";
import { State } from "../../State";
import { BaseCompState } from "./BaseCompState";
import { CompIntf } from "./CompIntf";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

/**
 * This base class is a hybrid that can render React components or can be used to render plain HTML to be used in innerHTML of elements.
 * The innerHTML approach is being phased out in order to transition fully over to normal ReactJS.
 */
export abstract class Comp<S extends BaseCompState = any> implements CompIntf {
    static renderCounter: number = 0;
    static focusElmId: string = null;
    public rendered: boolean = false;
    public debug: boolean = false;

    public debugState: boolean = false;
    private static guid: number = 0;

    e: Function = createElement;

    attribs: any;

    /* Note: NULL elements are allowed in this array and simply don't render anything, and are required to be tolerated and ignored */
    private children: CompIntf[];

    logEnablementLogic: boolean = true;
    jsClassName: string;
    clazz: string;

    // holds queue of functions to be ran once this component is rendered.
    domAddFuncs: ((elm: HTMLElement) => void)[];

    renderRawHtml: boolean = false;

    /**
     * 'react' should be true only if this component and all its decendants are true React components that are rendered and
     * controlled by ReactJS (rather than our own innerHTML)
     *
     * allowRect can be set to false for components that are known to be used in cases where not all of their subchildren are react or for
     * whatever reason we want to disable react rendering, and fall back on render-to-text approach
     */
    constructor(attribs?: any, private s?: State<S>) {
        this.domAddEvent = this.domAddEvent.bind(this);
        this.domRemoveEvent = this.domRemoveEvent.bind(this);
        this.domUpdateEvent = this.domUpdateEvent.bind(this);
        this.domPreUpdateEvent = this.domPreUpdateEvent.bind(this);

        if (!s) {
            this.s = new State<S>();
        }
        this.attribs = attribs || {};

        /* If an ID was specifically provided, then use it, or else generate one */
        let id = this.attribs.id || ("c" + Comp.nextGuid().toString(16));
        this.clazz = this.constructor.name;
        this.setId(id);
    }

    private setId(id: string) {
        this.attribs.id = id;

        if (!this.attribs.key) {
            this.attribs.key = id;
        }
        this.jsClassName = this.constructor.name + "_" + id;
    }

    static nextGuid(): number {
        return ++Comp.guid;
    }

    getId(): string {
        return this.attribs.id;
    }

    /* Warning: Under lots of circumstances it's better to call util.getElm rather than getElement() because getElement returns
    null unless the element is already created and rendered onto the DOM */
    getElement(): HTMLElement {
        // DO NOT DELETE
        // if (this.ref && this.ref.current) {
        //     // console.log("***** got element from ref! " + this.jsClassName);
        //     return this.ref.current;
        // }
        // console.log("*** getting element from old-school dom call.");
        return <HTMLElement>document.getElementById(this.getId());
    }

    // This is the original implementation of whenElm which uses a timer to wait for the element to come into existence
    // and is only used in one odd place where we manually attach Dialogs to the DOM (see DialogBase.ts)
    whenElmEx(func: (elm: HTMLElement) => void) {
        S.util.getElm(this.getId(), func);
    }

    // WARNING: Use whenElmEx for DialogBase derived components!
    whenElm(func: (elm: HTMLElement) => void) {
        // console.log("whenElm running for " + this.jsClassName);

        let elm = this.getElement();
        if (elm) {
            // console.log("Looked for and FOUND on DOM: " + this.jsClassName);
            func(elm);
            return;
        }

        if (this.debug) {
            console.log("queueing whenElm function on " + this.jsClassName);
        }

        // queue up the 'func' to be called once the domAddEvent gets executed.
        if (!this.domAddFuncs) {
            this.domAddFuncs = [func];
        }
        else {
            this.domAddFuncs.push(func);
        }
    }

    setVisible(visible: boolean) {
        this.mergeState({ visible } as any);
    }

    setEnabled(enabled: boolean) {
        this.mergeState({ enabled } as any);
    }

    setClass(clazz: string): void {
        this.attribs.className = clazz;
    }

    setInnerHTML(html: string) {
        this.whenElm(function (elm: HTMLElement) {
            elm.innerHTML = html;
        });
    }

    addChild(comp: CompIntf): void {
        if (!comp) return;
        if (!this.children) {
            this.children = [comp];
        }
        else {
            this.children.push(comp);
        }
    }

    addChildren(comps: Comp[]): void {
        if (comps == null || comps.length === 0) return;
        if (!this.children) {
            this.children = [...comps];
        }
        else {
            this.children.push.apply(this.children, comps);
        }
    }

    /* Returns true if there are any non-null children */
    hasChildren(): boolean {
        if (this.children == null || this.children.length === 0) return false;
        return this.children.some(child => !!child);
    }

    setChildren(comps: CompIntf[]) {
        this.children = comps;
    }

    safeGetChildren(): CompIntf[] {
        if (!this.children) {
            this.children = [];
        }
        return this.children;
    }

    getChildren(): CompIntf[] {
        return this.children;
    }

    getAttribs(): Object {
        return this.attribs;
    }

    renderHtmlElm(elm: ReactElement): string {
        return renderToString(elm);
    }

    reactRenderHtmlInDiv(): string {
        this.updateDOM(null, this.getId() + "_re");
        return "<div id='" + this.getId() + "_re'></div>";
    }

    reactRenderHtmlInSpan(): string {
        this.updateDOM(null, this.getId() + "_re");
        return "<span id='" + this.getId() + "_re'></span>";
    }

    /* Attaches a react element directly to the dom at the DOM id specified.
       WARNING: This can only re-render the *children* under the target node and not the attributes or tag of the node itself.

       Also this can only re-render TOP LEVEL elements, meaning elements that are not children of other React Elements, but attached
       to the DOM old-school.
    */
    updateDOM(store: any = null, id: string = null) {
        if (!id) {
            id = this.getId();
        }
        // if (!this.render) {
        //     throw new Error("Attempted to treat non-react component as react: " + this.constructor.name);
        // }
        S.util.getElm(id, (elm: HTMLElement) => {
            // See #RulesOfHooks in this file, for the reason we blow away the existing element to force a rebuild.
            ReactDOM.unmountComponentAtNode(elm);

            (this._render as any).displayName = this.jsClassName;
            this.wrapClickFunc(this.attribs);
            let reactElm = this.e(this._render, this.attribs);

            /* If this component has a store then wrap with the Redux Provider to make it all reactive */
            if (store) {
                // console.log("Rendering with provider");
                let provider = this.e(Provider, { store }, reactElm);
                ReactDOM.render(provider, elm);
            }
            else {
                ReactDOM.render(reactElm, elm);
            }
        });
    }

    wrapClickFunc = (obj: any) => {
        /* Whenever we have a mouse click function which triggers a React Re-render cycle
         react doesn't have the ability to maintain focus correctly, so we have this crutch
         to help accomplish that. It's debatable whether this is a 'hack' or good code. */
        if (obj && obj.onClick) {
            let func = obj.onClick;

            // wrap the click function to maintain focus element.
            obj.onClick = (arg: any) => {
                Comp.focusElmId = obj.id;
                // console.log("Click (wrapped): " + this.jsClassName + " obj: " + S.util.prettyPrint(obj));
                func(arg);
            };
        }

        let state = store.getState();
        if (!state.mouseEffect || !obj) return;
        // console.log("Wrap Click: " + this.jsClassName + " obj: " + S.util.prettyPrint(obj));
        if (obj.onClick) {
            obj.onClick = S.util.delayFunc(obj.onClick);
        }
    }

    buildChildren(): ReactNode[] {
        // console.log("buildChildren: " + this.jsClassName);
        if (this.children == null || this.children.length === 0) return null;
        let reChildren: ReactNode[] = [];

        this.children.forEach((child: CompIntf) => {
            if (child) {
                let reChild: ReactNode = null;
                try {
                    // console.log("ChildRender: " + child.jsClassName);
                    (this._render as any).displayName = child.jsClassName;
                    this.wrapClickFunc(child.attribs);
                    reChild = this.e(child._render, child.attribs);
                }
                catch (e) {
                    console.error("Failed to render child " + child.jsClassName + " attribs.key=" + child.attribs.key);
                }

                if (reChild) {
                    reChildren.push(reChild);
                }
                else {
                    // console.log("ChildRendered to null: " + child.jsClassName);
                }
            }
        });
        return reChildren;
    }

    focus(): void {
        this.whenElm((elm: HTMLElement) => {
            S.util.delayedFocus(this.getId());
        });
    }

    updateVisAndEnablement() {
        if (this.s.state.enabled === undefined) {
            this.s.state.enabled = true;
        }

        if (this.s.state.visible === undefined) {
            this.s.state.visible = true;
        }
    }

    /* Renders this node to a specific tag, including support for non-React children anywhere in the subgraph */
    tagRender(tag: any, content: string, props: any) {
        // console.log("Comp.tagRender: " + this.jsClassName + " id=" + props.id);
        this.updateVisAndEnablement();

        try {
            let children: any[] = this.buildChildren();
            if (children) {
                if (content) {
                    children.unshift(content);
                }
            }
            else {
                children = content ? [content] : null;
            }

            this.wrapClickFunc(props);
            if (children && children.length > 0) {
                // console.log("Render Tag with children.");
                return this.e(tag, props, children);
            }
            else {
                // console.log("Render Tag no children.");
                return this.e(tag, props);
            }
        }
        catch (e) {
            console.error("Failed in Comp.tagRender" + this.jsClassName + " attribs=" + S.util.prettyPrint(this.attribs));
        }
    }

    /* This is how you can add properties and overwrite them in existing state. Since all components are assumed to have
       both visible/enbled properties, this is the safest way to set other state that leaves visible/enabled props intact
       */
    mergeState(moreState: S): any {
        this.s.mergeState(moreState);
    }

    forceRender() {
        this.mergeState({ forceRender: Comp.nextGuid() } as any);
    }

    setState = (newState: any): any => {
        this.s.setState(newState);
    }

    /* Note: this method performs a direct state mod, until react overrides it using useState return value

    To add new properties...use this pattern (mergeState above does this)
    setStateFunc(prevState => {
        // Object.assign would also work
        return {...prevState, ...updatedValues};
    });

    There are places where 'mergeState' works but 'setState' fails, that needs investigation like EditNodeDlg.
    */
    setStateEx(state: any) {
        this.s.setStateEx(state);
    }

    getState(): S {
        return this.s.state;
    }

    // Core 'render' function used by react. Never really any need to override this, but it's theoretically possible.
    _render = (): ReactNode => {
        // Log.log("render(): " + this.jsClassName);
        this.rendered = true;

        let ret: ReactNode = null;
        try {
            this.s.useState();
            this.attribs.ref = useRef(null);

            useEffect(this.domAddEvent, []);
            useEffect(this.domUpdateEvent);
            useLayoutEffect(this.domPreUpdateEvent);
            // this works too...
            // useLayoutEffect(() => this.domPreUpdateEvent(), []);
            useEffect(() => this.domRemoveEvent, []);

            this.updateVisAndEnablement();

            /* Theoretically we could avoid calling preRender if it weren't for the fact that React monitors
            which hooks get called at each render cycle, so if we bypass the preRender because we wont' be using
            the children it generates, react will still throw an error becasue the calls to those hooks will not have been made.

            DO NOT DELETE THE COMMENTED IF BELOW (it serves as warning of what NOT to do.)
            */
            this.preRender();

            Comp.renderCounter++;
            if (this.debug) {
                console.log("render: " + this.jsClassName + " counter=" + Comp.renderCounter + " ID=" + this.getId());
            }

            ret = this.compRender();
        }
        catch (e) {
            console.error("Failed to render child (in render method)" + this.jsClassName + " attribs.key=" + this.attribs.key + "\nError: " + e);
        }
        return ret;
    }

    public domPreUpdateEvent(): void {
    }

    public domUpdateEvent(): void {
    }

    public domRemoveEvent(): void {
    }

    public domAddEvent(): void {
        // console.log("domAddEvent: " + this.jsClassName);

        /* In order for a React Render to not loose focus (sometimes) we keep track of the last thing that
        was clicked, and restore focus back to that whenever components are rendered. Without this code you can't even
        do a click on a node row, and then start scrolling with keyboard,...it would take TWO clicks to force focus that
        will allow scrolling using keyboard. */
        if (this.attribs.onClick && this.attribs.id === Comp.focusElmId) {
            // console.log("clicked element should have focus");
            S.util.focusElmById(Comp.focusElmId);
        }

        // todo-0: look into completely removing the need for 'domAddFuncs' stuff now that we have a 'ref'
        // that we can use to get the element from in a callback function on any component.
        if (this.domAddFuncs) {
            let elm: HTMLElement = this.getElement();
            if (!elm) {
                // I'm getting this happening during rendering a timeline (somehow also dependent on WHAT kind of rows
                // are IN the timeline), but I'm not convinced yet it's a bug, rather than
                // just a component that's now gone, and somehow gets here despite being gone.
                // console.error("elm not found in domAddEvent: " + this.jsClassName);
                return;
            }
            else {
                // console.log("domAddFuncs running for "+this.jsClassName+" for "+this.domAddFuncs.length+" functions.");
            }
            this.domAddFuncs.forEach(function (func) {
                func(elm);
            }, this);
            this.domAddFuncs = null;
        }
    }

    /* Intended to be optionally overridable to set children, and the ONLY thing to be done in this method should also be
    just to set the children */
    preRender(): void {
    }

    // This is the function you override/define to implement the actual render method, which is simple and decoupled from state
    // manageent aspects that are wrapped in 'render' which is what calls this, and the ONLY function that calls this.
    abstract compRender(): ReactNode;
}
