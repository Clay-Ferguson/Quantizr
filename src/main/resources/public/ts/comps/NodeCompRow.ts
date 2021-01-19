import { useSelector } from "react-redux";
import { AppState } from "../AppState";
import { Constants as C } from "../Constants";
import { NodeActionType } from "../enums/NodeActionType";
import { TypeHandlerIntf } from "../intf/TypeHandlerIntf";
import * as J from "../JavaIntf";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { Comp } from "../widget/base/Comp";
import { CompIntf } from "../widget/base/CompIntf";
import { Div } from "../widget/Div";
import { IconButton } from "../widget/IconButton";
import { NodeCompButtonBar } from "./NodeCompButtonBar";
import { NodeCompContent } from "./NodeCompContent";
import { NodeCompRowFooter } from "./NodeCompRowFooter";
import { NodeCompRowHeader } from "./NodeCompRowHeader";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

/* General Widget that doesn't fit any more reusable or specific category other than a plain Div, but inherits capability of Comp class */
export class NodeCompRow extends Div {

    /* we have this flag so we can turn off buttons to troubleshoot performance. */
    static showButtonBar: boolean = true;

    constructor(public node: J.NodeInfo, public index: number, public count: number, public rowCount: number, public level: number,
        public isTableCell: boolean, public allowNodeMove: boolean, public imgSizeOverride: string, private allowAvatars: boolean, appState: AppState) {
        super(null, {
            id: S.nav._UID_ROWID_PREFIX + node.id
        });

        /* If we're in edit mode allow dragging */
        if (appState.userPreferences.editMode && !appState.inlineEditId) {
            this.attribs.draggable = "true";
            this.attribs.onDragStart = this.dragStart;
            this.attribs.onDragEnd = this.dragEnd;
        }
    }

    dragStart = (ev): void => {
        /* If mouse is not over type icon during a drag start don't allow dragging. This way the entire ROW is the thing that is
        getting dragged, but we don't accept drag events anywhere on the node, because we specifically don't want to. We intentionally
        have draggableId so make is so that the user can only do a drag by clicking the type icon itself to start the drag. */
        if (S.meta64.draggableId !== this.node.id) {
            ev.preventDefault();
            return;
        }
        ev.target.style.borderLeft = "6px dotted green";
        ev.dataTransfer.setData("text", ev.target.id);
    }

    dragEnd = (ev): void => {
        ev.target.style.borderLeft = "6px solid transparent";
    }

    preRender(): void {
        let state: AppState = useSelector((state: AppState) => state);
        let node = this.node;
        let id: string = node.id;
        this.attribs.onClick = S.meta64.getNodeFunc(S.nav.cached_clickNodeRow, "S.nav.clickNodeRow", node.id);

        let insertInlineButton = null;
        if (state.userPreferences.editMode) {
            let insertAllowed = true;

            /* if we are at level one that means state.node is the parent of 'this.node' so that's what determines if we
            can insert or not */
            if (this.level === 1) {
                let parentTypeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(state.node.type);
                if (parentTypeHandler) {
                    insertAllowed = state.isAdminUser || parentTypeHandler.allowAction(NodeActionType.insert, state.node, state);
                }
            }

            let isPageRootNode = state.node && this.node.id === state.node.id;

            if (!isPageRootNode && this.level === 1 && insertAllowed && S.edit.isInsertAllowed(node, state)) {
                insertInlineButton = new IconButton("fa-plus", null, {
                    onClick: e => {
                        S.edit.insertNode(node.id, "u", 0 /* isFirst ? 0 : 1 */, state);
                    },
                    title: "Insert new node" + (this.isTableCell ? " (above this one)" : "")
                }, "btn-secondary " + (this.isTableCell ? "" : "plusButtonFloatRight"));
            }
        }

        let buttonBar: Comp = null;
        if (NodeCompRow.showButtonBar && !state.inlineEditId) {
            buttonBar = new NodeCompButtonBar(node, this.allowAvatars, this.allowNodeMove, this.level, this.isTableCell ? [insertInlineButton] : null);
        }

        let layoutClass = this.isTableCell ? "node-grid-item" : "node-table-row";
        const layout = S.props.getNodePropVal(J.NodeProp.LAYOUT, this.node);

        // if this node has children as columnar layout, and is rendering as the root node of a page or a node that is expanded inline,
        // that means there will be a grid below this node so we don't show the border (bottom divider line) because it's more attractive not to.
        if (this.isTableCell) {
        }
        else if (layout && layout.indexOf("c") === 0 && (!!S.props.getNodePropVal(J.NodeProp.INLINE_CHILDREN, this.node) || this.node.id === state.node.id)) {
        }
        else {
            if (state.userPreferences.editMode) {
                layoutClass += " editing-border";
            }
            else {
                layoutClass += " non-editing-border";
            }
        }

        let indentLevel = this.isTableCell ? 0 : this.level;
        let style = indentLevel > 0 ? { marginLeft: "" + ((indentLevel - 1) * 30) + "px" } : null;

        let focusNode: J.NodeInfo = S.meta64.getHighlightedNode(state);
        let selected: boolean = (focusNode && focusNode.id === id);
        this.attribs.className = (layoutClass || "") + (selected ? " active-row" : " inactive-row");

        if (S.render.enableRowFading && S.render.fadeInId === node.id && S.render.allowFadeInId) {
            S.render.fadeInId = null;
            S.render.allowFadeInId = false;
            this.attribs.className += " fadeInRowBkgClz";
            S.meta64.fadeStartTime = new Date().getTime();
        }

        this.attribs.style = style;

        let header: CompIntf = null;
        if (state.userPreferences.showMetaData) {
            header = new NodeCompRowHeader(node, true, false);
        }

        // if editMode is on, an this isn't the page root node
        if (state.userPreferences.editMode && this.node.id !== state.node.id) {
            S.render.setNodeDropHandler(this.attribs, this.node, true, state);
        }

        this.setChildren([
            this.isTableCell ? null : insertInlineButton,
            header,
            buttonBar,
            buttonBar ? new Div(null, {
                className: "clearfix",
                id: "button_bar_clearfix_" + node.id
            }) : null,
            new NodeCompContent(node, true, true, null, null, this.imgSizeOverride),
            new NodeCompRowFooter(node, false)
        ]);
    }

    /* Return an object such that, if this object changes, we must render, or else we don't need to render

    This implementation is technically very incorrect, but was enough to just use the selection state and ID to
    determine of the caching of ReactNodes (via. Comp.memoMap) rather than constructing them from scratch
    on every render was enough to create a noticeable performance gain. Unfortunately it WAS NOT. So the 'memoMap'
    experimental code is being left in place for now, but the approach didn't work. There's more notes in Comp.ts
    about this performance hack attempt.
    */
    makeCacheKeyObj(appState: AppState, state: any, props: any) {
        let focusNode: J.NodeInfo = S.meta64.getHighlightedNode(appState);
        let selected: boolean = (focusNode && focusNode.id === this.node.id);
        let key = this.node.id + " " + selected;
        // console.log("cache key: " + key + " for element: " + this.jsClassName);
        return key;
        // state = this.getState();
        // return {
        //     nodeId: this.node.id,
        //     content: this.node.content,
        //     stateEnabled: state.enabled,
        //     props,
        // };
    }
}
