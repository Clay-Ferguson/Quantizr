import * as J from "../JavaIntf";
import { AppState } from "../AppState";

export interface EditIntf {
    showReadOnlyProperties: boolean;

    saveClipboardToChildNode(parentId?: string): void;
    splitNode(node: J.NodeInfo, splitType: string, delimiter: string, state: AppState): void;
    joinNodes(state?: AppState): void;
    openChangePasswordDlg(state: AppState): void;
    openManageAccountDlg(state: AppState): void;
    editPreferences(state: AppState): void;
    openImportDlg(state: AppState): void;
    openExportDlg(state: AppState): void;
    isEditAllowed(node: any, state: AppState): boolean;
    isInsertAllowed(node: any, state: AppState): boolean;
    startEditingNewNode(typeName: string, createAtTop: boolean, parentNode: J.NodeInfo, nodeInsertTarget: J.NodeInfo, ordinalOffset: number, state: AppState): void;
    insertNodeResponse(res: J.InsertNodeResponse, state: AppState): void;
    createSubNodeResponse(res: J.CreateSubNodeResponse, state: AppState): void;
    saveNodeResponse(node: J.NodeInfo, res: J.SaveNodeResponse, allowScroll: boolean, state: AppState): void;
    toggleEditMode(state: AppState): void;
    toggleShowMetaData(state: AppState): void;
    moveNodeUp(evt: Event, id: string, state?: AppState): void;
    moveNodeDown(evt: Event, id: string, state?: AppState): void;
    moveNodeToTop(id: string, state: AppState): void;
    moveNodeToBottom(id: string, state: AppState): void;
    getFirstChildNode(state: AppState): any;
    getLastChildNode(state: AppState): any;
    runEditNode(elm: any, id: any, state?: AppState): void;
    insertNode(id: string, typeName: string, ordinalOffset: number, state?: AppState): void;
    toolbarInsertNode(evt: Event, id: string): void;
    createSubNode(id: any, typeName: string, createAtTop: boolean, parentNode: J.NodeInfo, state: AppState): void;
    selectAllNodes(state: AppState) : void;
    deleteSelNodes(evt: Event, nodeId: string, state?: AppState);
    getBestPostDeleteSelNode(state: AppState): J.NodeInfo;
    cutSelNodes(evt: Event, id: string, state?: AppState): void;
    undoCutSelNodes(state: AppState): void;
    pasteSelNodesInside(evt: Event, id: string);
    pasteSelNodes(nodeId: string, location: string, state?: AppState): void;
    pasteSelNodes_InlineAbove(evt: Event, id: string);
    pasteSelNodes_Inline(evt: Event, id: string);
    insertBookWarAndPeace(state: AppState): void;
    clearInbox(state: AppState): void;
    newSubNode(evt: Event, id: string);
    addNode(nodeId: string, content: string, state: AppState): void;
    createNode(node: J.NodeInfo, typeName: string, state: AppState): void;
    addCalendarEntry(initDate: number, state: AppState): void;
    moveNodeByDrop(targetNodeId: string, sourceNodeId: string, isFirts: boolean): void;
    initNodeEditResponse(res: J.InitNodeEditResponse, state: AppState): void;
    updateHeadings(state: AppState): void;
}
