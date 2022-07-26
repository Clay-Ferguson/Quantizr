import { useAppState } from "../../AppRedux";
import { Comp } from "../../comp/base/Comp";
import { Button } from "../../comp/core/Button";
import { CollapsiblePanel } from "../../comp/core/CollapsiblePanel";
import { Div } from "../../comp/core/Div";
import { Constants as C } from "../../Constants";
import { EditNodeDlg } from "../../dlg/EditNodeDlg";
import { DialogMode } from "../../enums/DialogMode";
import { TabIntf } from "../../intf/TabIntf";
import * as J from "../../JavaIntf";
import { S } from "../../Singletons";
import { NodeCompRow } from "./NodeCompRow";

export class NodeCompVerticalRowLayout extends Div {
    static showSpecialNodes = true;

    constructor(public node: J.NodeInfo, private tabData: TabIntf<any>, public level: number, public allowNodeMove: boolean, private allowHeaders: boolean) {
        super();
    }

    preRender(): void {
        let state = useAppState();
        let childCount: number = this.node.children.length;
        let comps: Comp[] = [];
        let collapsedComps: Object[] = [];
        let allowInsert = S.edit.isInsertAllowed(this.node, state);
        let rowCount: number = 0;
        let lastNode: J.NodeInfo = null;
        let rowIdx = 0;

        // This boolean helps us keep from putting two back to back vertical spaces which would otherwise be able to happen.
        let inVerticalSpace = false;
        let isMine = S.props.isMine(state.node, state);

        this.node.children?.forEach((n: J.NodeInfo) => {
            if (!n) return;
            if (!(state.nodesToMove && state.nodesToMove.find(id => id === n.id))) {
                // console.log("RENDER ROW[" + rowIdx + "]: node.id=" + n.id + " targetNodeId=" + S.quanta.newNodeTargetId);

                let boostComp: NodeCompRow = null;
                if (n.boostedNode) {
                    // console.log("BOOST TARGET: " + S.util.prettyPrint(n.boostedNode));

                    let childrenImgSizes = S.props.getPropStr(J.NodeProp.CHILDREN_IMG_SIZES, n.boostedNode);
                    let typeHandler = S.plugin.getTypeHandler(n.boostedNode.type);
                    boostComp = new NodeCompRow(n.boostedNode, this.tabData, typeHandler, 0, 0, 0, this.level, false, false, childrenImgSizes, this.allowHeaders, false, true, true, null, state);
                }

                if (state.editNode && state.editNodeOnTab === C.TAB_MAIN && S.quanta.newNodeTargetId === n.id && S.quanta.newNodeTargetOffset === 0) {
                    comps.push(EditNodeDlg.embedInstance || new EditNodeDlg(state.editNode, state.editEncrypt, state.editShowJumpButton, state, DialogMode.EMBED, null));
                }

                if (state.editNode && state.editNodeOnTab === C.TAB_MAIN && n.id === state.editNode.id) {
                    comps.push(EditNodeDlg.embedInstance || new EditNodeDlg(state.editNode, state.editEncrypt, state.editShowJumpButton, state, DialogMode.EMBED, null));
                }
                else {
                    let childrenImgSizes = S.props.getPropStr(J.NodeProp.CHILDREN_IMG_SIZES, this.node);
                    let typeHandler = S.plugin.getTypeHandler(n.type);

                    // special case where we aren't in edit mode, and we run across a markdown type with blank content, then don't render it.
                    if (typeHandler && typeHandler.getTypeName() === J.NodeType.NONE && !n.content && !state.userPreferences.editMode && !S.props.hasBinary(n)) {
                    }
                    else {
                        lastNode = n;
                        let row: Comp = null;
                        if (n.children && !inVerticalSpace) {
                            comps.push(new Div(null, { className: "vertical-space" }));
                        }

                        /* NOTE: This collapsesComps type thing is intentionally not done on the NodeCompTableRowLayout layout type
                         because if the user wants their Account root laid out in a grid just let them do that and show everything
                         without doing any collapsedComps. */
                        if (typeHandler && typeHandler.isSpecialAccountNode()) {
                            if (NodeCompVerticalRowLayout.showSpecialNodes) {
                                row = new NodeCompRow(n, this.tabData, typeHandler, rowIdx, childCount, rowCount + 1, this.level, false, true, childrenImgSizes, this.allowHeaders, false, true, false, null, state);

                                // I'm gonna be evil here and do this object without a type.
                                collapsedComps.push({ comp: row, subOrdinal: typeHandler.subOrdinal() });
                            }
                        }
                        else {
                            row = new NodeCompRow(n, this.tabData, typeHandler, rowIdx, childCount, rowCount + 1, this.level, false, true, childrenImgSizes, this.allowHeaders, isMine, true, false, boostComp, state);
                            comps.push(row);
                        }
                        inVerticalSpace = false;
                    }

                    rowCount++;
                    // if we have any children on the node they will always have been loaded to be displayed so display them
                    // This is the linline children
                    if (n.children) {
                        comps.push(S.render.renderChildren(n, this.tabData, this.level + 1, this.allowNodeMove, state));
                        comps.push(new Div(null, { className: "vertical-space" }));
                        inVerticalSpace = true;
                    }
                }

                if (state.editNode && state.editNodeOnTab === C.TAB_MAIN && S.quanta.newNodeTargetId === n.id && S.quanta.newNodeTargetOffset === 1) {
                    comps.push(EditNodeDlg.embedInstance || new EditNodeDlg(state.editNode, state.editEncrypt, state.editShowJumpButton, state, DialogMode.EMBED, null));
                }
            }
            rowIdx++;
        });

        if (isMine && this.allowHeaders && allowInsert && !state.isAnonUser && state.userPreferences.editMode) {
            let attribs = {};
            if (state.userPreferences.editMode) {
                S.render.setNodeDropHandler(attribs, lastNode, false, state);
            }

            if (this.level <= 1) {
                let insertButton: Button = null;
                // todo-1: this button should have same enablement as "new" button, on the page root
                // Note: this is the very last "+" button at the bottom, to insert below last child
                comps.push(new Div(null, { className: (state.userPreferences.editMode ? "node-table-row-compact" : "node-table-row") }, [
                    insertButton = new Button(null, e => {
                        if (lastNode) {
                            S.edit.insertNode(lastNode.id, "u", 1 /* isFirst ? 0 : 1 */, state);
                        }
                        else {
                            S.edit.newSubNode(null, state.node.id);
                        }
                    }, {
                        iconclass: "fa fa-plus",
                        title: "Insert new node"
                    }, "btn-secondary plusButtonFloatRight")
                ]));

                // todo-1: document this in tips and tricks
                S.util.setDropHandler(insertButton.attribs, true, (evt: DragEvent) => {
                    const data = evt.dataTransfer.items;
                    for (let i = 0; i < data.length; i++) {
                        const d = data[i];
                        // console.log("DROP[" + i + "] kind=" + d.kind + " type=" + d.type);
                        if (d.kind === "file") {
                            EditNodeDlg.pendingUploadFile = data[i].getAsFile();
                            if (lastNode) {
                                S.edit.insertNode(lastNode.id, "u", 1 /* isFirst ? 0 : 1 */, state);
                            }
                            else {
                                S.edit.newSubNode(null, state.node.id);
                            }
                            return;
                        }
                    }
                });

                if (lastNode) {
                    let userCanPaste = (S.props.isMine(lastNode, state) || state.isAdminUser) && lastNode.id !== state.homeNodeId;
                    if (!!state.nodesToMove && userCanPaste) {
                        comps.push(new Button("Paste Here", S.edit.pasteSelNodes_Inline, { nid: lastNode.id }, "btn-secondary pasteButton marginLeft"));
                    }
                }
            }
        }

        if (collapsedComps.length > 0) {
            // put them in subOrdinal order on the page.
            collapsedComps.sort((a: any, b: any) => a.subOrdinal - b.subOrdinal);

            comps.push(new CollapsiblePanel("Other Account Nodes", "Hide", null, collapsedComps.map((c: any) => c.comp), false, (s: boolean) => {
                state.otherAccountNodesExpanded = s;
            }, state.otherAccountNodesExpanded, "marginAll", "specialAccountNodesPanel", ""));
        }

        this.setChildren(comps);
    }
}
