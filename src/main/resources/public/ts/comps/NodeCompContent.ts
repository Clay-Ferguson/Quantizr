import * as J from "../JavaIntf";
import { Singletons } from "../Singletons";
import { PubSub } from "../PubSub";
import { Constants as C } from "../Constants";
import { Comp } from "../widget/base/Comp";
import { TypeHandlerIntf } from "../intf/TypeHandlerIntf";
import { NodeCompMarkdown } from "./NodeCompMarkdown";
import { NodeCompBinary } from "./NodeCompBinary";
import { Div } from "../widget/Div";
import { NodeCompRowHeader } from "./NodeCompRowHeader";
import { useSelector, useDispatch } from "react-redux";
import { AppState } from "../AppState";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

/* General Widget that doesn't fit any more reusable or specific category other than a plain Div, but inherits capability of Comp class */
export class NodeCompContent extends Div {

    /* switches for performance testing. */
    static showRowHeader: boolean = true;

    domPreUpdateFunc: Function;

    constructor(public node: J.NodeInfo, public rowStyling: boolean, public showHeader: boolean, public idPrefix?: string, public isFeed?: boolean, public imgSizeOverride?: string) {
        super(null, {
            id: (idPrefix ? idPrefix : "c") + node.id
        });

        if (!NodeCompContent.showRowHeader) {
            this.showHeader = false;
        }
    }

    preRender(): void {
        let state: AppState = useSelector((state: AppState) => state);
        let node = this.node;

        if (!node) {
            this.setChildren(null);
            return;
        }

        let children: Comp[] = [];
        let typeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(node.type);

        if (state.showProperties) {
            let propTable = S.props.renderProperties(node.properties);
            if (propTable) {
                children.push(propTable);
            }
        } else {
            /*
             * Special Rendering for Nodes that have a plugin-renderer
             */
            if (typeHandler) {
                this.domPreUpdateFunc = typeHandler.getDomPreUpdateFunction;
                children.push(typeHandler.render(node, this.rowStyling, state));
            }
            //note: this path is obsolete now. always will have a type.
            else {
                children.push(new NodeCompMarkdown(node));
            }
        }

        /* if node owner matches node id this is someone's account root node, so what we're doing here is not
         showing the normal attachment for this node, because that will the same as the avatar */
        let isAnAccountNode = node.ownerId && node.id == node.ownerId;

        if (S.props.hasBinary(node) && !isAnAccountNode) {
            let binary = new NodeCompBinary(node, false, false, this.imgSizeOverride);

            //todo-1: bring this back. I already needed it again.
            /*
             * We append the binary image or resource link either at the end of the text or at the location where
             * the user has put {{insert-attachment}} if they are using that to make the image appear in a specific
             * location in the content text.
             *
             * NOTE: temporarily removing during refactoring.
             */
            // if (util.contains(ret, cnst.INSERT_ATTACHMENT)) {
            //     ret = S.util.replaceAll(ret, cnst.INSERT_ATTACHMENT, binary.render());
            // } else {
            children.push(binary);
            //}
        }

        this.setChildren(children);
    }

    /* We do two things in here: 1) update formula rendering, and 2) change all "a" tags inside this div to have a target=_blank */
    domPreUpdateEvent = (): void => {
        if (this.domPreUpdateFunc) {
            this.whenElm((elm) => {
                this.domPreUpdateFunc(this);
            });
        }
    }
}
