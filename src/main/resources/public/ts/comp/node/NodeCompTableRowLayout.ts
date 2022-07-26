import { useAppState } from "../../AppRedux";
import { Comp } from "../../comp/base/Comp";
import { Button } from "../../comp/core/Button";
import { Div } from "../../comp/core/Div";
import { TabIntf } from "../../intf/TabIntf";
import * as J from "../../JavaIntf";
import { S } from "../../Singletons";
import { NodeCompRow } from "./NodeCompRow";

export class NodeCompTableRowLayout extends Div {

    constructor(public node: J.NodeInfo, private tabData: TabIntf<any>, public level: number, public layout: string, public allowNodeMove: boolean, private allowHeaders: boolean) {
        super(null, { className: "node-grid-table" });
    }

    preRender(): void {
        let state = useAppState();
        let nodesToMove = state.nodesToMove;
        let curRow = new Div(null, { className: "node-grid-row" });
        let children: Comp[] = [];
        let childCount: number = this.node.children.length;
        let rowCount: number = 0;
        let maxCols = 2;

        if (this.layout === "c2") {
            maxCols = 2;
        }
        else if (this.layout === "c3") {
            maxCols = 3;
        }
        else if (this.layout === "c4") {
            maxCols = 4;
        }
        else if (this.layout === "c5") {
            maxCols = 5;
        }
        else if (this.layout === "c6") {
            maxCols = 6;
        }
        let cellWidth = 100 / maxCols;
        let allowInsert = S.edit.isInsertAllowed(this.node, state);
        let curCols = 0;
        let lastNode: J.NodeInfo = null;
        let rowIdx = 0;

        // This boolean helps us keep from putting two back to back vertical spaces which would otherwise be able to happen.
        let inVerticalSpace = false;

        this.node.children?.forEach((n: J.NodeInfo) => {
            if (!n) return;
            let comps: Comp[] = [];

            if (!(nodesToMove && nodesToMove.find(id => id === n.id))) {

                if (this.debug && n) {
                    console.log("RENDER ROW[" + rowIdx + "]: node.id=" + n.id);
                }

                let childrenImgSizes = S.props.getPropStr(J.NodeProp.CHILDREN_IMG_SIZES, this.node);
                let typeHandler = S.plugin.getTypeHandler(n.type);

                // special case where we aren't in edit mode, and we run across a markdown type with blank content AND no attachment, then don't even render it.
                if (typeHandler && typeHandler.getTypeName() === J.NodeType.NONE && !n.content && !state.userPreferences.editMode && !S.props.hasBinary(n)) {
                }
                else {
                    lastNode = n;
                    if (n.children && !inVerticalSpace) {
                        comps.push(new Div(null, { className: "vertical-space" }));
                    }
                    let row: Comp = new NodeCompRow(n, this.tabData, typeHandler, rowIdx, childCount, rowCount + 1, this.level, true, this.allowNodeMove, childrenImgSizes, this.allowHeaders, true, true, false, null, state);
                    inVerticalSpace = false;
                    comps.push(row);
                }

                rowCount++;
                // if we have any children on the node they will always have been loaded to be displayed so display them
                // This is the linline children
                if (n.children) {
                    comps.push(S.render.renderChildren(n, this.tabData, this.level + 1, this.allowNodeMove, state));
                    comps.push(new Div(null, { className: "vertical-space" }));
                    inVerticalSpace = true;
                }

                let curCol = new Div(null, {
                    className: "node-grid-cell",
                    style: {
                        width: cellWidth + "%",
                        maxWidth: cellWidth + "%"
                    }
                }, comps);

                curRow.addChild(curCol);

                if (++curCols === maxCols) {
                    children.push(curRow);
                    curRow = new Div(null, { className: "tableRow" });
                    curCols = 0;
                }
            }
            rowIdx++;
        });

        // the last row might not have filled up yet but add it still
        if (curCols > 0) {
            children.push(curRow);
        }

        let isMine = S.props.isMine(state.node, state);

        /* I'll leave this block here, for future reference, but it's dead code. If editMode is on we never do the
        table layout but show each node as if it were vertical layout instead */
        if (isMine && this.allowHeaders && allowInsert && !state.isAnonUser && state.userPreferences.editMode) {
            let attribs = {};
            if (state.userPreferences.editMode) {
                S.render.setNodeDropHandler(attribs, lastNode, false, state);
            }

            if (this.level <= 1) {
                // todo-1: this button should have same enablement as "new" button, on the page root

                children.push(new Button(null, e => {
                    if (lastNode) {
                        S.edit.insertNode(lastNode.id, "u", 1 /* isFirst ? 0 : 1 */, state);
                    } else {
                        S.edit.newSubNode(null, state.node.id);
                    }
                }, {
                    iconclass: "fa fa-plus",
                    title: "Insert new node"
                }, "btn-secondary marginLeft marginTop"));

                let userCanPaste = (S.props.isMine(lastNode, state) || state.isAdminUser) && lastNode.id !== state.homeNodeId;
                if (!!state.nodesToMove && userCanPaste) {
                    children.push(new Button("Paste Here", S.edit.pasteSelNodes_Inline, { nid: lastNode.id }, "btn-secondary pasteButton marginLeft"));
                }
            }
        }
        this.setChildren(children);
    }
}
