import { Div } from "./Div";
import { Main } from "./Main";

export class FullScreenGraphViewer extends Main {

    preRender(): void {
        // let state: AppState = useSelector((state: AppState) => state);
        // let nodeId = state.fullScreenViewId;
        // let node: J.NodeInfo = S.meta64.findNodeById(state, nodeId);

        // if (!node) {
        //     console.log("Can't find nodeId "+nodeId);
        // }

        // let isAnAccountNode = node && node.ownerId && node.id == node.ownerId;

        // let children = [];

        // if (node && S.props.hasBinary(node) && !isAnAccountNode) {
        //     let binary = new NodeCompBinary(node, false, true, null);
        //     children.push(binary);
        // }

        this.setChildren([new Div("Graph goes here")]);
    }
}
