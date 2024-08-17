import { AppState } from "../../AppState";
import { Div } from "../../comp/core/Div";
import { OpenGraphPanel } from "../../comp/OpenGraphPanel";
import { Constants as C } from "../../Constants";
import { TabIntf } from "../../intf/TabIntf";
import { NodeInfo } from "../../JavaIntf";
import { ResultSetInfo } from "../../ResultSetInfo";
import { S } from "../../Singletons";
import { SearchResultSetView } from "../SearchResultSetView";

export class SearchTab implements TabIntf<ResultSetInfo> {
    name = "Search";
    tooltip = "Showing the results of your most recent search";
    id = C.TAB_SEARCH;
    props = new ResultSetInfo();
    scrollPos = 0;
    openGraphComps: OpenGraphPanel[] = [];
    topmostVisibleElmId: string = null;

    static inst: SearchTab = null;
    constructor() {
        SearchTab.inst = this;
    }

    isVisible = () => S.tabUtil.resultSetHasData(C.TAB_SEARCH);
    constructView = (data: TabIntf) => new SearchResultSetView(data)
    getTabSubOptions = (): Div => { return null; };

    findNode = (nodeId: string): NodeInfo => {
        return S.util.searchNodeArray(this.props.results, nodeId);
    }

    findNodeByPath = (_path: string): NodeInfo => {
        return null;
    }

    nodeDeleted = (_ust: AppState, nodeId: string): void => {
        this.props.results = this.props.results?.filter(n => nodeId !== n.id);
    }

    replaceNode = (_ust: AppState, newNode: NodeInfo): void => {
        if (!this.props.results) return;

        this.props.results = this.props.results?.map(n => {
            return n?.id === newNode?.id ? newNode : n;
        });
    }

    processNode = (_ust: AppState, func: (node: NodeInfo) => void): void => {
        this.props.results?.forEach(n => func(n));
    }
}
