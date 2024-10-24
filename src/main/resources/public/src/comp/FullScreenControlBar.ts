import { dispatch, getAs } from "../AppContext";
import { Constants as C } from "../Constants";
import { FullScreenType } from "../Interfaces";
import { Attachment } from "../JavaIntf";
import { S } from "../Singletons";
import { Div } from "../comp/core/Div";
import { IconButton } from "../comp/core/IconButton";
import { FullScreenGraphViewer } from "./FullScreenGraphViewer";
import { Comp } from "./base/Comp";
import { ButtonBar } from "./core/ButtonBar";
import { Checkbox } from "./core/Checkbox";

// todo-2: This really needs to be part of the fullscreen viewer classes themselves since each one
// really might have a different version of this.
export class FullScreenControlBar extends Comp {

    constructor() {
        super();
        this.attribs.className = "tw-float-right fullScreenToolbar";
    }

    override preRender(): boolean | null {
        this.children = this.getComps();
        return true;
    }

    getComps = (): Comp[] => {
        const ast = getAs();
        const comps = [];
        const buttons = [];

        if (ast.fullScreenConfig.type === FullScreenType.IMAGE && ast.activeTab === C.TAB_MAIN) {
            const node = S.nodeUtil.findNode(ast.fullScreenConfig.nodeId);
            let onFirst = false;
            let onLast = false;
            if (node && node.attachments) {
                const list: Attachment[] = S.props.getOrderedAtts(node);

                if (list.length > 1) {
                    onFirst = (list[0].ordinal || 0) === ast.fullScreenConfig.ordinal;
                    onLast = (list[list.length - 1].ordinal || 0) === ast.fullScreenConfig.ordinal;
                }
            }

            if (!onFirst) {
                buttons.push(
                    new IconButton("fa-angle-left fa-lg", "", {
                        onClick: S.nav._prevFullScreenImgViewer,
                        title: "View Previous Attachment"
                    }, "-primary", "off"));
            }

            if (!onLast) {
                buttons.push(
                    new IconButton("fa-angle-right fa-lg", "", {
                        onClick: S.nav._nextFullScreenImgViewer,
                        title: "View Next Attachment"
                    }, "-primary", "off"));
            }
        }

        if (ast.fullScreenConfig.type === FullScreenType.GRAPH) {
            comps.push(new Div(null, { className: "inlineBlock" }, [
                new Checkbox("RDF Links", { title: "Show NodeLinks" }, {
                    setValue: (checked: boolean) => {
                        dispatch("setShowNodeLinks", s => {
                            FullScreenGraphViewer.reset();
                            s.showNodeLinksInGraph = checked;
                        });
                    },
                    getValue: (): boolean => ast.showNodeLinksInGraph
                }, "inlineBlock"),
                // if there are no force links we should hide this
                ast.showNodeLinksInGraph ? new Checkbox("RDF Forces", { title: "NodeLinks Force Attractions" }, {
                    setValue: (checked: boolean) => {
                        dispatch("setLinkForces", s => {
                            FullScreenGraphViewer.reset();
                            s.attractionLinksInGraph = checked;
                        });
                    },
                    getValue: (): boolean => ast.attractionLinksInGraph
                }, "inlineBlock") : null
            ]));

            buttons.push(
                new IconButton("fa-window-minimize fa-lg", null, {
                    onClick: S.nav._minimizeFullScreenViewer,
                    title: "Minimize Graph"
                }, "-primary", "off"));
        }

        buttons.push(
            new IconButton("fa-window-close fa-lg", null, {
                onClick: S.nav._closeFullScreenViewer,
                title: "Close Viewer (ESC Key)"
            }, "-primary", "off"));

        if (buttons.length > 0) {
            comps.push(new ButtonBar(buttons, "tw-float-right"));
        }

        return comps;
    }
}
