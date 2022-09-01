import { dispatch, getAppState } from "./AppContext";
import { AppState } from "./AppState";
import { Comp } from "./comp/base/Comp";
import { CompIntf } from "./comp/base/CompIntf";
import { Constants as C } from "./Constants";
import { MainMenuDlg } from "./dlg/MainMenuDlg";
import { FullScreenType } from "./Interfaces";
import * as J from "./JavaIntf";
import { Log } from "./Log";
import { NodeHistoryItem } from "./NodeHistoryItem";
import { S } from "./Singletons";

declare let g_initialTab: string;

export class Quanta {
    static appGuid: string = "appid." + Math.random();
    mainMenu: MainMenuDlg;
    noScrollToId: string = null;
    activeTab: string;

    newNodeTargetId: string;
    newNodeTargetOffset: number;

    app: CompIntf;
    appInitialized: boolean = false;
    curUrlPath: string = window.location.pathname + window.location.search;

    // This holds the currently highlighted node (the val) for the given page parent node (the key)
    parentIdToFocusNodeMap: Map<string, string> = new Map<string, string>();

    curHighlightNodeCompRow: CompIntf = null;

    private static lastKeyDownTime: number = 0;

    /* We want to only be able to drag nodes by clicking on their TYPE ICON, and we accomplish that by using the mouseover/mouseout
    on those icons to detect an 'is mouse over' condition any time a drag attempt is started on a row and only allow it if mouse
    is over the icon */
    public draggableId: string = null;

    // use this to know how long to delay the refresh for breadrumbs should wait to keep from interrupting the fade effect
    // by doing which would happen if it rendered before the fade effect was complete. (see fadeInRowBkgClz)
    public fadeStartTime: number = 0;

    public currentFocusId: string = null;

    /* We save userName+password in these vars to pass in every request
    so that we can log back in again silently after any session timeout */
    userName: string;
    authToken: string;
    loggingOut: boolean;

    // WARNING: Call S.util.ctrlKeyCheck() to check for ctrlKey and NOT just the state of this.
    // (I should've just used a timer to set back to false, but instead for now it's checked by calling ctrlKeyCheck)
    ctrlKey: boolean;
    ctrlKeyTime: number;

    // maps the hash of an encrypted block of text to the unencrypted text, so that we never run the same
    // decryption code twice.
    decryptCache: Map<string, string> = new Map<string, string>();

    /* Map of all URLs and the openGraph object retrieved for it */
    openGraphData: Map<string, J.OpenGraph> = new Map<string, J.OpenGraph>();

    nodeHistory: NodeHistoryItem[] = [];
    nodeHistoryLocked: boolean;

    refresh = (state: AppState) => {
        if (C.DEBUG_SCROLLING) {
            console.log("Quanta.refresh");
        }
        // S.view.jumpToId(state.node.id);
        S.view.refreshTree({
            nodeId: null,
            zeroOffset: false,
            renderParentIfLeaf: true,
            highlightId: null,
            forceIPFSRefresh: false,
            scrollToTop: true,
            allowScroll: true,
            setTab: true,
            forceRenderParent: false,
            state
        });
    }

    initApp = async () => {
        try {
            Log.log("quanta.initApp()");

            const mobileMode: string = await S.localDB.getVal(C.LOCALDB_MOBILE_MODE, "all-users");
            if (mobileMode) {
                dispatch("SetMobileMode", s => {
                    s.mobileMode = mobileMode === "true";
                    return s;
                });
            }

            // runClassDemoTest();

            // The JS in index.html will check for this 2 seconds after it knows all the JS has loaded
            // and if this value isn't set it prints a message just saying the browser isn't supported.
            (window as any).__initAppStarted = true;

            if (this.appInitialized) {
                throw new Error("initApp called multiple times.");
            }
            this.appInitialized = true;

            if (history.scrollRestoration) {
                history.scrollRestoration = "manual";
            }

            console.log("initMarkdown");
            S.render.initMarkdown();

            console.log("createTabs");
            S.tabUtil.createAppTabs();

            const state = getAppState();
            state.pendingLocationHash = window.location.hash;

            console.log("createPlugins");
            S.plugin.initPlugins();

            (window as any).addEvent = (object: any, type: any, callback: any) => {
                if (!object || typeof (object) === "undefined") {
                    return;
                }
                if (object.addEventListener) {
                    object.addEventListener(type, callback, false);
                } else if (object.attachEvent) {
                    object.attachEvent("on" + type, callback);
                } else {
                    object["on" + type] = callback;
                }
            };

            // leaving for future reference. Currently not needed.
            // window.onhashchange = function (e) {
            // }

            /*
            NOTE: This works in conjunction with pushState, and is part of what it takes to make the back button (browser hisotry) work
            in the context of SPAs
            */
            window.onpopstate = (event) => {
                Log.log("POPSTATE: location: " + document.location + ", state: " + JSON.stringify(event.state));

                if (event.state && event.state.nodeId) {
                    S.view.refreshTree({
                        nodeId: event.state.nodeId,
                        zeroOffset: true,
                        renderParentIfLeaf: true,
                        highlightId: event.state.highlightId,
                        forceIPFSRefresh: false,
                        scrollToTop: false,
                        allowScroll: true,
                        setTab: true,
                        forceRenderParent: false,
                        state: getAppState()
                    });
                    S.tabUtil.selectTab(C.TAB_MAIN);
                }
            };

            /* We have to run this timer to wait for document.body to exist becasue we load our JS in the HTML HEAD
             because we need our styling in place BEFORE the page renders or else you get that
            well-known issue of a momentarily unstyled render before the page finishes loading */
            const interval = setInterval(() => {
                if (!document?.body) {
                    console.log("Waiting for document.body");
                    return;
                }
                clearInterval(interval);

                document.body.addEventListener("mousemove", function (e: any) {
                    S.domUtil.mouseX = e.clientX;
                    S.domUtil.mouseY = e.clientY;
                });

                document.body.addEventListener("click", function (e: any) {
                    e = e || window.event;
                    // const target: HTMLElement = e.target;

                    // Whenever something is clicked, forget the pending focus data
                    Comp.focusElmId = null;
                    // Log.log("document.body.click target.id=" + target.id);
                }, false);

                document.body.addEventListener("focusin", (e: any) => {
                    // Log.log("focusin id=" + e.target.id);
                    this.currentFocusId = e.target.id;
                });

                // This is a cool way of letting CTRL+UP, CTRL+DOWN scroll to next node.
                // WARNING: even with tabIndex added none of the other DIVS react renders seem to be able to accept an onKeyDown event.
                // Todo: before enabling this need to make sure 1) the Main Tab is selected and 2) No Dialogs are Open, because this WILL
                // capture events going to dialogs / edit fields
                document.body.addEventListener("keydown", (event: KeyboardEvent) => {
                    // console.log("keydown: " + event.code);
                    let state = getAppState();

                    if (event.code === "Backquote") {
                        if (S.util.ctrlKeyCheck()) {
                            S.domUtil.addAnnotation();
                        }
                    }
                    else {
                        switch (event.code) {
                            case "ControlLeft":
                                this.ctrlKey = true;
                                this.ctrlKeyTime = new Date().getTime();
                                break;
                            case "Escape":
                                S.domUtil.removeAnnotation();
                                if (S.util.fullscreenViewerActive(state)) {
                                    S.nav.closeFullScreenViewer(state);
                                }
                                break;

                            // case "ArrowDown":
                            //     if (this.keyDebounce()) return;
                            //     state = getAppState()
                            //     S.view.scrollRelativeToNode("down", state);
                            //     break;

                            // case "ArrowUp":
                            //     if (this.keyDebounce()) return;
                            //     state = getAppState()
                            //     S.view.scrollRelativeToNode("up", state);
                            //     break;

                            case "ArrowLeft":
                                if (this.keyDebounce()) return;
                                // S.nav.navUpLevel();
                                if (state.fullScreenConfig.type === FullScreenType.IMAGE) {
                                    S.nav.prevFullScreenImgViewer(state);
                                }
                                break;

                            case "ArrowRight":
                                if (this.keyDebounce()) return;
                                state = getAppState();
                                // S.nav.navOpenSelectedNode(state);
                                if (state.fullScreenConfig.type === FullScreenType.IMAGE) {
                                    S.nav.nextFullScreenImgViewer(state);
                                }
                                break;

                            default: break;
                        }
                    }
                    // }
                });

                document.body.addEventListener("keyup", (event: KeyboardEvent) => {
                    switch (event.code) {
                        case "ControlLeft":
                            this.ctrlKey = false;
                            this.ctrlKeyTime = -1;
                            break;
                        default: break;
                    }
                });
            }, 100);

            Log.log("initConstants");
            S.props.initConstants();

            window.addEventListener("orientationchange", () => {
                // we force the page to re-render with an all new state.
                dispatch("orientationChange", s => {
                    return s;
                });
            });

            // not used. do not delete.
            // window.addEventListener("resize", () => {
            //     deviceWidth = window.innerWidth;
            //     deviceHeight = window.innerHeight;
            // });

            // This works, but is not needed. do not delete.
            // window.addEventListener("hashchange", function () {
            //     Log.log("The hash has changed: hash=" + location.hash);
            // }, false);

            S.domUtil.initClickEffect();

            // todo-2: actually this is a nuisance unless user is actually EDITING a node right now
            // so until i make it able to detect if user is editing i'm removing this.
            // do not delete.
            // window.onbeforeunload = () => {
            //     return "Leave [appName] ?";
            // };

            /*
             * This call checks the server to see if we have a session already, and gets back the login information from
             * the session, and then renders page content, after that.
             */
            await S.user.refreshLogin(getAppState(), g_initialTab);
            g_initialTab = null;
            console.log("refreshLogin completed.");

            S.rpcUtil.initProgressMonitor();
            S.util.processUrlParams(null);
            this.setOverlay(false);
            S.util.playAudioIfRequested();

            // This timer delay is just for asthetics and should not be required.
            setTimeout(async () => {
                S.push.init();
                const res = await S.rpcUtil.rpc<J.GetConfigRequest, J.GetConfigResponse>("getConfig", {
                    appGuid: Quanta.appGuid
                }, true);
                if (res.config) {
                    dispatch("configUpdates", s => {
                        s.config = res.config || {};
                        // console.log("CONFIG: " + S.util.prettyPrint(s.config));
                        if (s.config.userMessage) {
                            S.util.showMessage(s.config.userMessage, "");
                        }
                        return s;
                    });
                }
            }, 250);

            Log.log("initApp complete.");
            S.domUtil.enableMouseEffect();

            setTimeout(() => {
                S.encryption.initKeys();
            }, 1000);
        }
        catch (e) {
            console.error(e.message);
            alert("App failed to startup: " + e.message);
            throw e;
        }
    }

    keyDebounce = () => {
        const now = S.util.currentTimeMillis();
        // allow one operation every quarter second.
        if (Quanta.lastKeyDownTime > 0 && now - Quanta.lastKeyDownTime < 250) {
            return true;
        }
        Quanta.lastKeyDownTime = now;
        return false;
    }

    /* The overlayCounter allows recursive operations which show/hide the overlay
    to happen such that if something has already shown the overlay and not hidden it yet, then
    any number of 'sub-processes' (functionality) cannot distrupt the proper state. This is just
    the standard sort of 'reference counting' sort of algo here. Note that we initialize
    the counter to '1' and not zero since the overlay is initially visible so that's the correct
    counter state to start with.
    */
    static overlayCounter: number = 1; // this starting value is important.
    setOverlay = (showOverlay: boolean) => {

        Quanta.overlayCounter += showOverlay ? 1 : -1;
        // Log.log("overlayCounter=" + Meta64.overlayCounter);

        /* if overlayCounter goes negative, that's a mismatch */
        if (Quanta.overlayCounter < 0) {
            throw new Error("Overlay calls are mismatched");
        }

        if (Quanta.overlayCounter === 1) {

            /* Whenever we are about to show the overlay always give the app 0.7 seconds before showing the overlay in case
            the app did something real fast and the display of the overlay would have just been a wasted annoyance (visually)
            and just simply caused a bit of unnecessary eye strain
            */
            setTimeout(() => {
                // after the timer we check for the counter still being greater than zero (not an ==1 this time).
                if (Quanta.overlayCounter > 0) {
                    // Log.log("showing overlay.");
                    const elm = S.domUtil.domElm("overlayDiv");
                    if (elm) {
                        elm.style.display = "block";
                        elm.style.cursor = "wait";
                    }
                }
            }, 1200);
        }
        else if (Quanta.overlayCounter === 0) {
            // Log.log("hiding overlay.");
            const elm = S.domUtil.domElm("overlayDiv");
            if (elm) {
                elm.style.display = "none";
            }
        }
        // Log.log("overlayCounter=" + Meta64.overlayCounter);
    }
}
