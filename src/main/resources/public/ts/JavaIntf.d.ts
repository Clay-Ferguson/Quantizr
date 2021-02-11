/* tslint:disable */
/* eslint-disable */

export interface AddFriendRequest extends RequestBase {
    userName: string;
}

export interface AddPrivilegeRequest extends RequestBase {
    nodeId: string;
    privileges: string[];
    principal: string;
}

export interface AppDropRequest extends RequestBase {
    data: string;
}

export interface BrowseFolderRequest extends RequestBase {
    nodeId: string;
}

export interface ChangePasswordRequest extends RequestBase {
    newPassword: string;
    passCode: string;
}

export interface CloseAccountRequest extends RequestBase {
}

export interface CreateSubNodeRequest extends RequestBase {
    nodeId: string;
    pendingEdit: boolean;
    content: string;
    newNodeName: string;
    typeName: string;
    createAtTop: boolean;
    typeLock: boolean;
    properties: PropertyInfo[];
}

export interface DeleteAttachmentRequest extends RequestBase {
    nodeId: string;
}

export interface DeleteNodesRequest extends RequestBase {
    nodeIds: string[];
    childrenOnly: boolean;
}

export interface DeletePropertyRequest extends RequestBase {
    nodeId: string;
    propName: string;
}

export interface ExecuteNodeRequest extends RequestBase {
    nodeId: string;
}

export interface ExportRequest extends RequestBase {
    nodeId: string;
    exportExt: string;
    fileName: string;
}

export interface FileSearchRequest extends RequestBase {
    searchText: string;
    reindex: boolean;
    nodeId: string;
}

export interface FileSystemReindexRequest extends RequestBase {
    nodeId: string;
}

export interface GetConfigRequest extends RequestBase {
}

export interface GetFriendsRequest extends RequestBase {
}

export interface GetNodePrivilegesRequest extends RequestBase {
    nodeId: string;
    includeAcl: boolean;
    includeOwners: boolean;
}

export interface GetNodeStatsRequest extends RequestBase {
    nodeId: string;
}

export interface GetServerInfoRequest extends RequestBase {
    command: string;
    nodeId: string;
}

export interface GetSharedNodesRequest extends RequestBase {
    nodeId: string;
    shareTarget: string;
}

export interface GetUserAccountInfoRequest extends RequestBase {
}

export interface GetUserProfileRequest extends RequestBase {
    userId: string;
}

export interface GraphRequest extends RequestBase {
    nodeId: string;
    searchText: string;
}

export interface ImportRequest extends RequestBase {
    nodeId: string;
    sourceFileName: string;
}

export interface InitNodeEditRequest extends RequestBase {
    nodeId: string;
}

export interface InsertBookRequest extends RequestBase {
    nodeId: string;
    bookName: string;
    truncated: boolean;
}

export interface InsertNodeRequest extends RequestBase {
    pendingEdit: boolean;
    parentId: string;
    targetOrdinal: number;
    newNodeName: string;
    typeName: string;
    initialValue: string;
}

export interface LoadNodeFromIpfsRequest extends RequestBase {
    path: string;
}

export interface LoginRequest extends RequestBase {
}

export interface LogoutRequest extends RequestBase {
}

export interface LuceneIndexRequest extends RequestBase {
    nodeId: string;
    path: string;
}

export interface LuceneSearchRequest extends RequestBase {
    nodeId: string;
    text: string;
}

export interface MoveNodesRequest extends RequestBase {
    targetNodeId: string;
    nodeIds: string[];
    location: string;
}

export interface NodeFeedRequest extends RequestBase {
    page: number;
    nodeId: string;
    feedUserName: string;
    toMe: boolean;
    fromMe: boolean;
    fromFriends: boolean;
    toPublic: boolean;
    nsfw: boolean;
    searchText: string;
}

export interface NodeSearchRequest extends RequestBase {
    sortDir: string;
    sortField: string;
    nodeId: string;
    searchText: string;
    searchProp: string;
    fuzzy: boolean;
    caseSensitive: boolean;
    searchDefinition: string;
    userSearch: boolean;
    localUserSearch: boolean;
    foreignUserSearch: boolean;
}

export interface OpenSystemFileRequest extends RequestBase {
    fileName: string;
}

export interface PingRequest extends RequestBase {
}

export interface PublishNodeToIpfsRequest extends RequestBase {
    nodeId: string;
}

export interface RebuildIndexesRequest extends RequestBase {
}

export interface RemovePrivilegeRequest extends RequestBase {
    nodeId: string;
    principalNodeId: string;
    privilege: string;
}

export interface RenderCalendarRequest extends RequestBase {
    nodeId: string;
}

export interface RenderNodeRequest extends RequestBase {
    nodeId: string;
    offset: number;
    siblingOffset: number;
    upLevel: boolean;
    renderParentIfLeaf: boolean;
    goToLastPage: boolean;
    singleNode: boolean;
    forceIPFSRefresh: boolean;
}

export interface ResetPasswordRequest extends RequestBase {
    user: string;
    email: string;
}

export interface SaveNodeRequest extends RequestBase {
    node: NodeInfo;
}

export interface SavePublicKeyRequest extends RequestBase {
    keyJson: string;
}

export interface SaveUserPreferencesRequest extends RequestBase {
    userPreferences: UserPreferences;
}

export interface SaveUserProfileRequest extends RequestBase {
    userName: string;
    userBio: string;
}

export interface SelectAllNodesRequest extends RequestBase {
    parentNodeId: string;
}

export interface SendTestEmailRequest extends RequestBase {
}

export interface SetCipherKeyRequest extends RequestBase {
    nodeId: string;
    principalNodeId: string;
    cipherKey: string;
}

export interface SetNodePositionRequest extends RequestBase {
    nodeId: string;
    targetName: string;
}

export interface ShutdownServerNodeRequest extends RequestBase {
}

export interface SignupRequest extends RequestBase {
    userName: string;
    password: string;
    email: string;
    reCaptchaToken: string;
}

export interface SplitNodeRequest extends RequestBase {
    splitType: string;
    nodeId: string;
    delimiter: string;
}

export interface TransferNodeRequest extends RequestBase {
    recursive: boolean;
    nodeId: string;
    fromUser: string;
    toUser: string;
}

export interface UpdateHeadingsRequest extends RequestBase {
    nodeId: string;
}

export interface UploadFromIPFSRequest extends RequestBase {
    pinLocally: boolean;
    nodeId: string;
    cid: string;
    mime: string;
}

export interface UploadFromUrlRequest extends RequestBase {
    storeLocally: boolean;
    nodeId: string;
    sourceUrl: string;
}

export interface RequestBase {
    userName?: string;
    password?: string;
    tzOffset?: number;
    dst?: boolean;
}

export interface AddFriendResponse extends ResponseBase {
}

export interface AddPrivilegeResponse extends ResponseBase {
    principalPublicKey: string;
    principalNodeId: string;
}

export interface AppDropResponse extends ResponseBase {
}

export interface BrowseFolderResponse {
    listingJson: string;
}

export interface ChangePasswordResponse extends ResponseBase {
    user: string;
}

export interface CloseAccountResponse extends ResponseBase {
}

export interface CreateSubNodeResponse extends ResponseBase {
    newNode: NodeInfo;
}

export interface DeleteAttachmentResponse extends ResponseBase {
}

export interface DeleteNodesResponse extends ResponseBase {
}

export interface DeletePropertyResponse extends ResponseBase {
}

export interface ExecuteNodeResponse extends ResponseBase {
    returnCode: number;
    output: string;
}

export interface ExportResponse extends ResponseBase {
    fileName: string;
}

export interface FeedPushInfo extends ServerPushInfo {
    nodeInfo: NodeInfo;
}

export interface FileSearchResponse extends ResponseBase {
    searchResultNodeId: string;
}

export interface FileSystemReindexResponse extends ResponseBase {
    report: string;
}

export interface FriendInfo {
    userName: string;
}

export interface GetConfigResponse extends ResponseBase {
    config: { [index: string]: any };
}

export interface GetFriendsResponse extends ResponseBase {
    friends: FriendInfo[];
}

export interface GetNodePrivilegesResponse extends ResponseBase {
    aclEntries: AccessControlInfo[];
    owners: string[];
}

export interface GetNodeStatsResponse extends ResponseBase {
    stats: string;
}

export interface GetPublicServerInfoResponse extends ResponseBase {
    serverInfo: string;
}

export interface GetServerInfoResponse extends ResponseBase {
    messages: InfoMessage[];
}

export interface GetSharedNodesResponse extends ResponseBase {
    searchResults: NodeInfo[];
}

export interface GetUserAccountInfoResponse extends ResponseBase {
    binTotal: number;
    binQuota: number;
}

export interface GetUserProfileResponse extends ResponseBase {
    userName: string;
    userBio: string;
    avatarVer: string;
    headerImageVer: string;
    userNodeId: string;
}

export interface GraphResponse extends ResponseBase {
    rootNode: GraphNode;
}

export interface ImportResponse extends ResponseBase {
}

export interface InfoMessage {
    message: string;
    type: string;
}

export interface InitNodeEditResponse extends ResponseBase {
    parentInfo: NodeInfo;
    nodeInfo: NodeInfo;
}

export interface InsertBookResponse extends ResponseBase {
    newNode: NodeInfo;
}

export interface InsertNodeResponse extends ResponseBase {
    newNode: NodeInfo;
}

export interface LoadNodeFromIpfsResponse extends ResponseBase {
}

export interface LoginResponse extends ResponseBase {
    rootNode: string;
    rootNodePath: string;
    userName: string;
    anonUserLandingPageNode: string;
    homeNodeOverride: string;
    userPreferences: UserPreferences;
    allowFileSystemSearch: boolean;
}

export interface LogoutResponse extends ResponseBase {
}

export interface LuceneIndexResponse extends ResponseBase {
}

export interface LuceneSearchResponse extends ResponseBase {
}

export interface MoveNodesResponse extends ResponseBase {
}

export interface NodeFeedResponse extends ResponseBase {
    endReached: boolean;
    searchResults: NodeInfo[];
}

export interface NodeSearchResponse extends ResponseBase {
    searchResults: NodeInfo[];
}

export interface NotificationMessage extends ServerPushInfo {
    nodeId: string;
    fromUser: string;
    message: string;
}

export interface OpenSystemFileResponse extends ResponseBase {
}

export interface PingResponse extends ResponseBase {
    serverInfo: string;
}

export interface PublishNodeToIpfsResponse extends ResponseBase {
}

export interface RebuildIndexesResponse extends ResponseBase {
}

export interface RemovePrivilegeResponse extends ResponseBase {
}

export interface RenderCalendarResponse extends ResponseBase {
    items: CalendarItem[];
}

export interface RenderNodeResponse extends ResponseBase {
    node: NodeInfo;
    endReached: boolean;
    noDataResponse: string;
    breadcrumbs: BreadcrumbInfo[];
}

export interface ResetPasswordResponse extends ResponseBase {
}

export interface SaveNodeResponse extends ResponseBase {
    node: NodeInfo;
    aclEntries: AccessControlInfo[];
}

export interface SavePublicKeyResponse extends ResponseBase {
}

export interface SaveUserPreferencesResponse extends ResponseBase {
}

export interface SaveUserProfileResponse extends ResponseBase {
}

export interface SelectAllNodesResponse extends ResponseBase {
    nodeIds: string[];
}

export interface SendTestEmailResponse extends ResponseBase {
}

export interface ServerPushInfo {
    type: string;
}

export interface SetCipherKeyResponse extends ResponseBase {
}

export interface SetNodePositionResponse extends ResponseBase {
}

export interface ShutdownServerNodeResponse extends ResponseBase {
}

export interface SignupResponse extends ResponseBase {
    userError: string;
    passwordError: string;
    emailError: string;
}

export interface SplitNodeResponse extends ResponseBase {
}

export interface TransferNodeResponse extends ResponseBase {
}

export interface UpdateHeadingsResponse extends ResponseBase {
}

export interface UploadFromIPFSResponse extends ResponseBase {
}

export interface UploadFromUrlResponse extends ResponseBase {
}

export interface ResponseBase {
    success: boolean;
    message: string;
    stackTrace: string;
    exceptionClass: string;
    exceptionType: string;
}

export interface PropertyInfo {
    name: string;
    value: string;
}

export interface NodeInfo {
    id: string;
    path: string;
    name: string;
    content: string;
    lastModified: Date;
    logicalOrdinal: number;
    ordinal: number;
    type: string;
    properties: PropertyInfo[];
    clientProps: PropertyInfo[];
    ac: AccessControlInfo[];
    hasChildren: boolean;
    cipherKey: string;
    lastChild: boolean;
    width: number;
    height: number;
    parent: NodeInfo;
    children: NodeInfo[];
    imgId: string;
    owner: string;
    ownerId: string;
    dataUrl: string;
    avatarVer: string;
    apAvatar: string;
}

export interface UserPreferences {
    editMode: boolean;
    showMetaData: boolean;
    maxUploadFileSize: number;
}

export interface AccessControlInfo {
    principalName: string;
    principalNodeId: string;
    privileges: PrivilegeInfo[];
    publicKey: string;
}

export interface GraphNode {
    id: string;
    level: number;
    highlight: boolean;
    name: string;
    children: GraphNode[];
}

export interface CalendarItem {
    id: string;
    title: string;
    start: number;
    end: number;
}

export interface BreadcrumbInfo {
    id: string;
    name: string;
    type: string;
}

export interface PrivilegeInfo {
    privilegeName: string;
}

export const enum Constant {
    ENC_TAG = "<[ENC]>",
}

export const enum NodeProp {
    ACT_PUB_ID = "ap:id",
    ACT_PUB_OBJ_TYPE = "ap:objType",
    ACT_PUB_OBJ_CONTENT = "ap:objContent",
    ACT_PUB_OBJ_INREPLYTO = "ap:objInReplyTo",
    ACT_PUB_OBJ_URL = "ap:objUrl",
    ACT_PUB_OBJ_ATTRIBUTED_TO = "ap:objAttributedTo",
    ACT_PUB_USER_ICON_URL = "ap:userIcon",
    ACT_PUB_ACTOR_ID = "ap:actorId",
    ACT_PUB_ACTOR_URL = "ap:actorUrl",
    ACT_PUB_ACTOR_INBOX = "ap:actorInbox",
    ACT_PUB_SENSITIVE = "ap:nsfw",
    ENC_KEY = "sn:encKey",
    TEMP = "tmp",
    RSS_FEED_SRC = "sn:rssFeedSrc",
    USER_PREF_PUBLIC_KEY = "sn:publicKey",
    USER_PREF_EDIT_MODE = "sn:editMode",
    USER_PREF_SHOW_METADATA = "sn:showMetaData",
    USER_PREF_PASSWORD_RESET_AUTHCODE = "sn:pwdResetAuth",
    SIGNUP_PENDING = "sn:signupPending",
    EMAIL_CONTENT = "sn:content",
    EMAIL_RECIP = "sn:recip",
    EMAIL_SUBJECT = "sn:subject",
    TARGET_ID = "sn:target_id",
    USER = "sn:user",
    USER_BIO = "sn:userBio",
    PWD_HASH = "sn:pwdHash",
    FILE_SYNC_LINK = "fs:link",
    USER_NODE_ID = "sn:userNodeId",
    FILENAME = "sn:fileName",
    NAME = "sn:name",
    IPFS_LINK = "ipfs:link",
    JSON_HASH = "ipfs:json",
    SAVE_TO_IPFS = "sn:saveToIpfs",
    IPFS_LINK_NAME = "ipfs:linkName",
    IPFS_SOURCE = "ipfs:source",
    FS_LINK = "fs:link",
    IPFS_OK = "ipfs:ok",
    MIME_EXT = "sn:ext",
    EMAIL = "sn:email",
    CODE = "sn:code",
    BIN_MIME = "sn:mimeType",
    BIN_FILENAME = "sn:fileName",
    BIN_SIZE = "sn:size",
    BIN_DATA_URL = "sn:dataUrl",
    FILE_NAME = "sn:fileName",
    JSON_FILE_SEARCH_RESULT = "sn:json",
    NOWRAP = "sn:nowrap",
    BIN_DATA = "sn:jcrData",
    BIN = "bin",
    BIN_URL = "sn:extUrl",
    IMG_WIDTH = "sn:imgWidth",
    IMG_HEIGHT = "sn:imgHeight",
    IMG_SIZE = "sn:imgSize",
    CHILDREN_IMG_SIZES = "sn:childrenImgSizes",
    BIN_TOTAL = "sn:binTot",
    LAST_LOGIN_TIME = "sn:lastLogin",
    CRYPTO_KEY_PUBLIC = "sn:cryptoKeyPublic",
    CRYPTO_KEY_PRIVATE = "sn:cryptoKeyPrivate",
    BIN_QUOTA = "sn:binQuota",
    INLINE_CHILDREN = "inlineChildren",
    PRIORITY = "priority",
    LAYOUT = "layout",
    ORDER_BY = "orderBy",
    TYPE_LOCK = "sn:typLoc",
    DATE = "date",
    DURATION = "duration",
}

export const enum NodeType {
    ACCOUNT = "sn:account",
    REPO_ROOT = "sn:repoRoot",
    INBOX = "sn:inbox",
    INBOX_ENTRY = "sn:inboxEntry",
    NOTES = "sn:notes",
    CALCULATOR = "sn:calculator",
    RSS_FEED = "sn:rssfeed",
    FRIEND_LIST = "sn:friendList",
    FRIEND = "sn:friend",
    POSTS = "sn:posts",
    ACT_PUB_POSTS = "ap:posts",
    NONE = "u",
    PLAIN_TEXT = "sn:txt",
    FS_FILE = "fs:file",
    FS_FOLDER = "fs:folder",
    FS_LUCENE = "fs:lucene",
    IPFS_NODE = "sn:ipfsNode",
    CALENDAR_ENTRY = "sn:cal",
}

export const enum PrincipalName {
    ANON = "anonymous",
    ADMIN = "admin",
    PUBLIC = "public",
}

export const enum PrivilegeType {
    READ = "rd",
    WRITE = "wr",
    ADD_CHILDREN = "ac",
    REMOVE_CHILDREN = "rc",
}
