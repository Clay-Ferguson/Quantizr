import { dispatch } from "../AppRedux";
import { AppState } from "../AppState";
import { Comp } from "../comp/base/Comp";
import { CompIntf } from "../comp/base/CompIntf";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Checkbox } from "../comp/core/Checkbox";
import { Clearfix } from "../comp/core/Clearfix";
import { CollapsiblePanel } from "../comp/core/CollapsiblePanel";
import { DateTimeField } from "../comp/core/DateTimeField";
import { Div } from "../comp/core/Div";
import { Form } from "../comp/core/Form";
import { Header } from "../comp/core/Header";
import { HelpButton } from "../comp/core/HelpButton";
import { HorizontalLayout } from "../comp/core/HorizontalLayout";
import { Icon } from "../comp/core/Icon";
import { IconButton } from "../comp/core/IconButton";
import { Label } from "../comp/core/Label";
import { LayoutRow } from "../comp/core/LayoutRow";
import { Selection } from "../comp/core/Selection";
import { Span } from "../comp/core/Span";
import { TextArea } from "../comp/core/TextArea";
import { TextContent } from "../comp/core/TextContent";
import { TextField } from "../comp/core/TextField";
import { NodeCompBinary } from "../comp/node/NodeCompBinary";
import { Constants as C } from "../Constants";
import { DialogBase } from "../DialogBase";
import { DialogMode } from "../enums/DialogMode";
import { NodeActionType } from "../enums/NodeActionType";
import * as I from "../Interfaces";
import { ValueIntf } from "../Interfaces";
import { TypeHandlerIntf } from "../intf/TypeHandlerIntf";
import * as J from "../JavaIntf";
import { PropValueHolder } from "../PropValueHolder";
import { S } from "../Singletons";
import { ValidatedState } from "../ValidatedState";
import { ChangeNodeTypeDlg } from "./ChangeNodeTypeDlg";
import { LS } from "./EditNodeDlgState";
import { EditNodeDlgUtil } from "./EditNodeDlgUtil";
import { EmojiPickerDlg } from "./EmojiPickerDlg";
import { FriendsDlg } from "./FriendsDlg";

/**
 * Node Editor Dialog
 */
export class EditNodeDlg extends DialogBase {

    utl: EditNodeDlgUtil = new EditNodeDlgUtil();

    static embedInstance: EditNodeDlg;
    editorHelp: string = null;
    header: Header;
    propertyEditFieldContainer: Div;
    uploadButton: IconButton;
    deleteUploadButton: Div;
    deletePropButton: IconButton;
    contentEditor: I.TextEditorIntf;
    contentEditorState: ValidatedState<any> = new ValidatedState<any>();
    nameState: ValidatedState<any> = new ValidatedState<any>();

    // holds a map of states by property names.
    propStates: Map<string, ValidatedState<any>> = new Map<string, ValidatedState<any>>();

    static morePanelExpanded: boolean = false;
    pendingEncryptionChange: boolean = false;

    // if user uploads or deletes an upload we set this, to force refresh when dialog closes even if they don't click save.
    binaryDirty: boolean = false;

    /* Since some of our property editing (the Selection components) modify properties 'in-place' in the node we have
    this initialProps clone so we can 'rollback' properties if use clicks cancel */
    initialProps: J.PropertyInfo[];

    allowEditAllProps: boolean = false;

    constructor(node: J.NodeInfo, private encrypt: boolean, private showJumpButton: boolean, state: AppState, mode: DialogMode = null) {
        super("[none]", mode === DialogMode.EMBED ? "app-embed-content" : "app-modal-content", false, state, mode);
        this.close = this.close.bind(this);

        if (mode === DialogMode.EMBED) {
            if (EditNodeDlg.embedInstance) {
                /* we get here if user starts editing another node and abandons the one currently being edited.
                 for now we just let this happen, but we could have asked the user if they MEANT to do that.
                 */
            }
            EditNodeDlg.embedInstance = this;
        }
        this.mergeState<LS>({
            node,
            // selected props is used as a set of all 'selected' (via checkbox) property names
            selectedProps: new Set<string>()
        });

        this.allowEditAllProps = this.appState.isAdminUser;
        this.initStates();
        this.initialProps = S.util.arrayClone(node.properties);

        /* This 'encrypt' will trigger this node to be encrypted whenever we're replying to
        an encrypted node. (i.e. the parent of this node is encrypted) */
        if (encrypt) {
            setTimeout(() => {
                this.utl.setEncryption(this, true);
            }, 500);
        }
    }

    initStates = (): void => {
        let state = this.getState<LS>();

        /* Init main content text on node */
        let value = state.node.content || "";
        if (!value.startsWith(J.Constant.ENC_TAG)) {
            this.contentEditorState.setValue(value);
        }
        else {
            this.contentEditorState.setValue("");
        }

        /* Initialize node name state */
        this.nameState.setValue(state.node.name);
        this.initPropStates(state.node, false);
    }

    /* Initializes the propStates for every property in 'node', and optionally if 'onlyBinaries==true' then we process ONLY
    the properties on node that are in 'S.props.allBinaryProps' list, which is how we have to update the propStates after
    an upload has been added or removed. */
    initPropStates = (node: J.NodeInfo, onlyBinaries: boolean): any => {
        let typeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(node.type);
        let customProps: string[] = null;
        if (typeHandler) {
            customProps = typeHandler.getCustomProperties();
            typeHandler.ensureDefaultProperties(node);
        }

        /* If we're updating binaries from the node properties, we need to wipe all the existing ones first to account for
        props that need to be removed */
        if (onlyBinaries) {
            S.props.allBinaryProps.forEach(s => {
                if (this.propStates.get(s)) {
                    this.propStates.delete(s);
                }
            });
        }

        if (node.properties) {
            node.properties.forEach((prop: J.PropertyInfo) => {
                // console.log("prop: " + S.util.prettyPrint(prop));

                // if onlyBinaries and this is NOT a binary prop then skip it.
                if (onlyBinaries) {
                    if (S.props.allBinaryProps.has(prop.name)) {
                        this.utl.initPropState(this, node, typeHandler, prop, false);
                    }
                    return;
                }

                if (!this.allowEditAllProps && !S.render.allowPropertyEdit(node, prop.name, this.appState)) {
                    // ("Hiding property: " + prop.name);
                    return;
                }

                if (this.allowEditAllProps || (
                    !S.render.isReadOnlyProperty(prop.name) || S.edit.showReadOnlyProperties)) {

                    if (!this.isGuiControlBasedProp(prop)) {
                        let allowSelection = !customProps || !customProps.find(p => p === prop.name);
                        this.utl.initPropState(this, node, typeHandler, prop, allowSelection);
                    }
                }
            });
        }
    }

    createLayoutSelection = (): Selection => {
        let selection: Selection = new Selection(null, "Layout", [
            { key: "v", val: "1 column" },
            { key: "c2", val: "2 columns" },
            { key: "c3", val: "3 columns" },
            { key: "c4", val: "4 columns" },
            { key: "c5", val: "5 columns" },
            { key: "c6", val: "6 columns" }
        ], "width-7rem", "col-3", new PropValueHolder(this.getState<LS>().node, J.NodeProp.LAYOUT, "v"));
        return selection;
    }

    createPrioritySelection = (): Selection => {
        return new Selection(null, "Priority", [
            { key: "0", val: "none" },
            { key: "1", val: "Top" },
            { key: "2", val: "High" },
            { key: "3", val: "Medium" },
            { key: "4", val: "Low" },
            { key: "5", val: "Backlog" }
        ], "width-7rem", "col-3", new PropValueHolder(this.getState<LS>().node, J.NodeProp.PRIORITY, "0"));
    }

    createImgSizeSelection = (label: string, allowNone: boolean, extraClasses: string, valueIntf: ValueIntf): Selection => {
        let options = [];

        if (allowNone) {
            // none means we would ignore the option during rendering, slightly different from "Actual" in cases
            // where this is an override that we don't want to override with. 'none' means don't override.
            options.push({ key: "n", val: "None" });
        }

        options = options.concat([
            { key: "0", val: "Actual" },
            { key: "15%", val: "15%" },
            { key: "25%", val: "25%" },
            { key: "50%", val: "50%" },
            { key: "80%", val: "80%" },
            { key: "90%", val: "90%" },
            { key: "100%", val: "100%" },
            { key: "50px", val: "50px" },
            { key: "100px", val: "100px" },
            { key: "200px", val: "200px" },
            { key: "300px", val: "300px" },
            { key: "400px", val: "400px" },
            { key: "800px", val: "800px" },
            { key: "1000px", val: "1000px" }
        ]);

        return new Selection(null, label, options, "width-7rem", extraClasses, valueIntf);
    }

    getTitleIconComp(): CompIntf {
        let state = this.getState<LS>();
        let span: Span = null;

        let typeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(state.node.type);
        if (typeHandler) {
            let iconClass = typeHandler.getIconClass();
            if (iconClass) {
                if (!span) span = new Span();
                span.addChild(new Icon({
                    title: `Node is a '${typeHandler.getName()}' type.`,
                    className: iconClass + " iconMarginRight"
                }));
            }
        }

        if (S.props.getNodePropVal(J.NodeProp.DATE, state.node)) {
            EditNodeDlg.morePanelExpanded = true;
            if (!span) span = new Span();
            span.addChild(new Icon({
                title: "Node has a 'Date' property.",
                className: "fa fa-calendar fa-lg iconMarginRight"
            }));
        }

        if (this.showJumpButton) {
            if (!span) span = new Span();
            span.addChild(new Icon({
                title: "Jump to Node",
                className: "fa fa-arrow-right fa-lg jumpButton",
                onClick: () => {
                    this.cancelEdit();
                    S.nav.closeFullScreenViewer(this.appState);
                    S.view.jumpToId(state.node.id);
                }
            }));
        }
        return span;
    }

    getExtraTitleBarComps(): CompIntf[] {
        let state = this.getState<LS>();
        let comps: CompIntf[] = [];

        if (S.props.isEncrypted(state.node)) {
            comps.push(new Icon({
                className: "fa fa-lock fa-lg iconMarginLeft"
            }));
        }
        return comps;
    }

    renderDlg(): CompIntf[] {
        let state = this.getState<LS>();
        let hasAttachment: boolean = S.props.hasBinary(state.node);

        this.editorHelp = null;
        let typeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(state.node.type);
        let customProps: string[] = null;
        if (typeHandler) {
            customProps = typeHandler.getCustomProperties();
            typeHandler.ensureDefaultProperties(state.node);
            this.editorHelp = typeHandler.getEditorHelp();
        }

        let allowContentEdit: boolean = typeHandler ? typeHandler.getAllowContentEdit() : true;

        let children = [
            S.speech.speechActive ? new TextContent("Speech-to-Text active. Mic listening...", "alert alert-primary") : null,
            new Form(null, [
                new Div(null, {
                }, [
                    this.propertyEditFieldContainer = new Div("", {
                    })
                ])
            ])
        ];

        let encryptCheckBox: Checkbox = !customProps ? new Checkbox("Encrypt", { className: "marginLeft" }, {
            setValue: (checked: boolean): void => {
                this.utl.setEncryption(this, checked);
            },
            getValue: (): boolean => {
                return S.props.isEncrypted(state.node);
            }
        }, "col-3") : null;

        let wordWrapCheckbox = new Checkbox("Word Wrap", { className: "marginLeft" }, {
            setValue: (checked: boolean): void => {
                // this is counter-intuitive that we invert here because 'NOWRAP' is a negation of "wrap"
                S.props.setNodePropVal(J.NodeProp.NOWRAP, state.node, checked ? null : "1");
                if (this.contentEditor) {
                    this.contentEditor.setWordWrap(checked);
                }
            },
            getValue: (): boolean => {
                return S.props.getNodePropVal(J.NodeProp.NOWRAP, state.node) !== "1";
            }
        }, "col-3");

        let selectionsBar = new Div(null, { className: "row marginTop" }, [
            state.node.hasChildren ? this.createLayoutSelection() : null,
            state.node.hasChildren ? this.createImgSizeSelection("Images", true, "col-3", //
                new PropValueHolder(this.getState<LS>().node, J.NodeProp.CHILDREN_IMG_SIZES, "n")) : null,
            this.createPrioritySelection()
        ]);

        let checkboxesBar = new Div(null, { className: "row marginLeft marginTop" }, [
            state.node.hasChildren ? new Checkbox("Inline Children", null,
                this.makeCheckboxPropValueHandler(J.NodeProp.INLINE_CHILDREN), "col-3") : null,
            wordWrapCheckbox,
            encryptCheckBox
        ]);

        let imgSizeSelection = S.props.hasImage(state.node) ? this.createImgSizeSelection("Image Size", false, "float-end", //
            new PropValueHolder(this.getState<LS>().node, J.NodeProp.IMG_SIZE, "100%")) : null;

        // This is the table that contains the custom editable properties inside the collapsable panel at the bottom.
        let propsTable: Comp = null;
        let mainPropsTable: Comp = null;

        // if customProps exists then the props are all added into 'editPropsTable' instead of the collapsible panel
        if (!customProps) {
            propsTable = new Div(null, {
                className: "edit-props-table form-group-border marginBottom"
            });
            // This is the container that holds the custom properties if provided, or else the name+content textarea at the top of not
            mainPropsTable = new Div(null, {
                className: "marginBottom"
            });
        }
        else {
            // This is the container that holds the custom properties if provided, or else the name+content textarea at the top of not
            mainPropsTable = new Div(null, {
                className: "edit-props-table form-group-border marginBottom"
            });
        }

        let propsParent: CompIntf = customProps ? mainPropsTable : propsTable;
        let isWordWrap = !S.props.getNodePropVal(J.NodeProp.NOWRAP, state.node);

        let nodeNameTextField = null;
        if (!customProps) {
            nodeNameTextField = new TextField("Node Name", false, null, null, false, this.nameState);
        }

        if (allowContentEdit) {
            let hasContentProp = typeHandler && typeHandler.hasCustomProp("content");
            let rows = this.appState.mobileMode ? "8" : "10";
            if (customProps && hasContentProp) {
                rows = "4";
            }

            if (!customProps || hasContentProp) {
                let contentTableRow = this.makeContentEditor(state.node, isWordWrap, rows);
                mainPropsTable.addChild(contentTableRow);
                this.contentEditor.setWordWrap(isWordWrap);
            }
        }

        let numPropsShowing: number = 0;
        if (state.node.properties) {
            // This loop creates all the editor input fields for all the properties
            state.node.properties.forEach((prop: J.PropertyInfo) => {
                // console.log("prop=" + S.util.prettyPrint(prop));

                if (!this.allowEditAllProps && !S.render.allowPropertyEdit(state.node, prop.name, this.appState)) {
                    // console.log("Hiding property: " + prop.name);
                    return;
                }

                if (this.allowEditAllProps || (
                    !S.render.isReadOnlyProperty(prop.name) || S.edit.showReadOnlyProperties)) {

                    if (!this.isGuiControlBasedProp(prop)) {
                        let allowSelection = !customProps || !customProps.find(p => p === prop.name);
                        let tableRow = this.makePropEditor(typeHandler, prop, allowSelection, typeHandler ? typeHandler.getEditorRowsForProp(prop.name) : 1);
                        numPropsShowing++;
                        propsParent.addChild(tableRow);
                    }
                }
            });
        }

        let allowPropertyAdd: boolean = typeHandler ? typeHandler.getAllowPropertyAdd() : true;
        if (allowPropertyAdd) {
            if (numPropsShowing > 0) {
                let propsButtonBar: ButtonBar = new ButtonBar([

                    new IconButton("fa fa-plus", null, {
                        onClick: () => this.utl.addProperty(this),
                        title: "Add property"
                    }),
                    this.deletePropButton = new IconButton("fa fa-minus", null, {
                        onClick: () => this.utl.deletePropertiesButtonClick(this),
                        title: "Delete property"
                    })
                ], null, "float-end");

                this.deletePropButton.setEnabled(false);

                // adds the button bar to the top of the list of children.
                propsParent.safeGetChildren().unshift(propsButtonBar, new Clearfix());
            }
        }

        let binarySection: LayoutRow = null;
        if (hasAttachment) {
            let ipfsLink = S.props.getNodePropVal(J.NodeProp.IPFS_LINK, state.node);
            let mime = S.props.getNodePropVal(J.NodeProp.BIN_MIME, state.node);

            let pinCheckbox: Checkbox = null;
            if (ipfsLink) {
                pinCheckbox = new Checkbox("IPFS Pinned", { className: "ipfsPinnedCheckbox" }, {
                    setValue: (checked: boolean): void => {
                        if (checked) {
                            this.utl.deleteProperties(this, [J.NodeProp.IPFS_REF]);
                        }
                        else {
                            S.props.setNodePropVal(J.NodeProp.IPFS_REF, this.getState<LS>().node, "1");
                        }
                    },
                    getValue: (): boolean => {
                        return S.props.getNodeProp(J.NodeProp.IPFS_REF, state.node) ? false : true;
                    }
                });
            }

            // NOTE: col numbers in the children of LayoutRow must add up to 12 (per bootstrap)!
            let topBinRow = new HorizontalLayout([
                new Div(null, { className: "bigMarginRight" }, [
                    new Div((ipfsLink ? "IPFS " : "") + "Attachment", {
                        className: "smallHeading"
                    }),
                    new NodeCompBinary(state.node, true, false, null),
                    this.deleteUploadButton = new Div("Delete", {
                        className: "deleteAttachmentLink",
                        onClick: () => this.utl.deleteUpload(this),
                        title: "Delete this attachment"
                    })
                ]),

                new HorizontalLayout([
                    imgSizeSelection,
                    pinCheckbox
                ])

                // todo-2: this is not doing what I want but it unimportant so removing it for now.
                // ipfsLink ? new Button("IPFS Link", () => S.render.showNodeUrl(state.node, this.appState), { title: "Show the IPFS URL for the attached file." }) : null
            ]);

            let bottomBinRow = null;
            if (ipfsLink) {
                bottomBinRow = new Div(null, { className: "marginLeft marginBottom" }, [
                    ipfsLink ? new Div(`CID: ${ipfsLink}`, {
                        className: "clickable",
                        title: "Click -> Copy to clipboard",
                        onClick: () => {
                            S.util.copyToClipboard(`ipfs://${ipfsLink}`);
                            S.util.flashMessage("Copied IPFS link to Clipboard", "Clipboard", true);
                        }
                    }) : null,
                    ipfsLink ? new Div(`Type: ${mime}`) : null
                ]);
            }

            binarySection = new Div(null, { className: "marginLeft binaryEditorSection editBinaryContainer" }, [
                topBinRow, bottomBinRow
            ]);
        }

        let sharingNames = S.nodeUtil.getSharingNames(state.node, false);
        let sharingDiv = null;
        let sharingDivClearFix = null;
        if (sharingNames) {
            // let isPublic = sharingNames.toLowerCase().indexOf("public") !== -1;

            sharingDiv = new Div("Shared to: " + sharingNames, {
                className: "marginBottom float-end sharingLabel",
                onClick: () => this.utl.share(this)
            });
            sharingDivClearFix = new Clearfix();
        }

        // if this props table would be empty don't display it (set to null)
        if (propsTable && !propsTable.hasChildren()) {
            propsTable = null;
        }

        let collapsiblePanel = !customProps ? new CollapsiblePanel(null, null, null, [
            new Div(null, { className: "marginBottom marginRight marginTop" }, [
                new Button("Type", this.openChangeNodeTypeDlg),
                allowPropertyAdd && numPropsShowing === 0 ? new Button("Props", () => this.utl.addProperty(this)) : null
            ]),
            nodeNameTextField, selectionsBar, checkboxesBar, propsTable
        ], false,
            (state: boolean) => {
                EditNodeDlg.morePanelExpanded = state;
            }, EditNodeDlg.morePanelExpanded, "marginRight", "marginTop", "marginTop", "span") : null;

        let rightFloatButtons = new Div(null, { className: "marginBottom" }, [
            collapsiblePanel
        ]);

        this.propertyEditFieldContainer.setChildren([mainPropsTable, sharingDiv, sharingDivClearFix, binarySection, rightFloatButtons,
            new Clearfix()]);
        return children;
    }

    makeCheckboxPropValueHandler(propName: string): I.ValueIntf {
        return {
            setValue: (checked: boolean): void => {
                S.props.setNodePropVal(propName, this.getState<LS>().node, checked ? "1" : null);
            },
            getValue: (): boolean => {
                return S.props.getNodePropVal(propName, this.getState<LS>().node) === "1";
            }
        };
    }

    renderButtons(): CompIntf {
        let state = this.getState<LS>();
        let hasAttachment: boolean = S.props.hasBinary(state.node);

        let typeHandler: TypeHandlerIntf = S.plugin.getTypeHandler(state.node.type);
        if (typeHandler) {
            typeHandler.ensureDefaultProperties(state.node);
        }

        let allowPropertyAdd: boolean = typeHandler ? typeHandler.getAllowPropertyAdd() : true;

        // let allowContentEdit: boolean = typeHandler ? typeHandler.getAllowContentEdit() : true;

        // //regardless of value, if this property is present we consider the type locked
        // let typeLocked = !!S.props.getNodePropVal(J.NodeProp.TYPE_LOCK, state.node);

        let allowUpload: boolean = typeHandler ? (this.appState.isAdminUser || typeHandler.allowAction(NodeActionType.upload, state.node, this.appState)) : true;
        let allowShare: boolean = typeHandler ? (this.appState.isAdminUser || typeHandler.allowAction(NodeActionType.share, state.node, this.appState)) : true;

        // let typeLocked = !!S.props.getNodePropVal(J.NodeProp.TYPE_LOCK, state.node);
        let datePropExists = S.props.getNodeProp(J.NodeProp.DATE, state.node);

        let numPropsShowing = this.utl.countPropsShowing(this);
        let advancedButtons: boolean = !!this.contentEditor;

        return new ButtonBar([
            new Button("Save", () => {
                this.utl.saveNode(this);
                this.close();
            }, { title: "Save this node and close editor." }, "btn-primary"),

            new Button("Cancel", this.cancelEdit, null),

            this.uploadButton = allowUpload ? new IconButton("fa-upload", null, {
                onClick: () => this.utl.upload(this),
                title: "Upload file attachment"
            }) : null,

            allowShare ? new IconButton("fa-users", null, {
                onClick: () => this.utl.share(this),
                title: "Share Node"
            }) : null,

            this.editorHelp ? new HelpButton(() => this.editorHelp) : null,

            // show delete button only if we're in a fullscreen viewer (like Calendar view)
            S.util.fullscreenViewerActive(this.appState)
                ? new Button("Delete", () => {
                    S.edit.deleteSelNodes(null, state.node.id);
                    this.close();
                }) : null,

            advancedButtons ? new Icon({
                className: "fa " + (S.speech.speechActive ? "fa-microphone-slash" : "fa-microphone") + " fa-lg editorButtonIcon",
                title: "Toggle on/off Speech Recognition to input text",
                onClick: this.speechRecognition
            }) : null,

            advancedButtons ? new Icon({
                className: "fa fa-clock-o fa-lg editorButtonIcon",
                title: "Insert current time at cursor",
                onClick: this.insertTime
            }) : null,

            advancedButtons && !datePropExists ? new Icon({
                className: "fa fa-calendar fa-lg editorButtonIcon",
                title: "Add 'date' property to node (makes Calendar entry)",
                onClick: () => this.utl.addDateProperty(this)
            }) : null,

            advancedButtons ? new Icon({
                className: "fa fa-user fa-lg editorButtonIcon",
                title: "Insert username/mention at cursor",
                onClick: this.insertMention
            }) : null,

            advancedButtons ? new Icon({
                className: "fa fa-smile-o fa-lg editorButtonIcon",
                title: "Insert emoji at cursor",
                onClick: this.insertEmoji
            }) : null,
            typeHandler && typeHandler.getName() && typeHandler.getTypeName() !== "u" ? new Span(typeHandler.getName(), {
                className: "float-end typeName"
            }) : null
        ]);
    }

    close(): void {
        super.close();
        if (this.mode === DialogMode.EMBED) {
            EditNodeDlg.embedInstance = null;
            dispatch("Action_endEditing", (s: AppState): AppState => {
                s.editNode = null;
                s.editNodeOnTab = null;
                s.editNodeReplyToId = null;
                S.quanta.newNodeTargetId = null;
                S.quanta.newNodeTargetOffset = -1;
                s.editShowJumpButton = false;
                s.editEncrypt = false;
                return s;
            });
        }
    }

    isGuiControlBasedProp = (prop: J.PropertyInfo): boolean => {
        return !!S.props.controlBasedPropertyList.has(prop.name);
    }

    toggleShowReadOnly = (): void => {
        // alert("not yet implemented.");
        // see saveNode for how to iterate all properties, although I wonder why I didn't just use a map/set of
        // properties elements
        // instead so I don't need to parse any DOM or domIds inorder to iterate over the list of them????
    }

    insertTime = (): void => {
        if (this.contentEditor) {
            this.contentEditor.insertTextAtCursor("[" + S.util.formatDate(new Date()) + "]");
        }
    }

    insertMention = async (): Promise<void> => {
        if (this.contentEditor) {
            let dlg: FriendsDlg = new FriendsDlg(null, this.appState, true);
            await dlg.open();
            if (dlg.getState().selectedName) {
                this.contentEditor.insertTextAtCursor(" @" + dlg.getState().selectedName + " ");
            }
        }
    }

    insertEmoji = async (): Promise<void> => {
        if (this.contentEditor) {
            let dlg: EmojiPickerDlg = new EmojiPickerDlg(this.appState);
            await dlg.open();
            if (dlg.getState().selectedEmoji) {
                this.contentEditor.insertTextAtCursor(dlg.getState().selectedEmoji);
            }
        }
    }

    openChangeNodeTypeDlg = (): void => {
        new ChangeNodeTypeDlg(this.getState<LS>().node.type, (type: string) => this.utl.setNodeType(this, type), this.appState).open();
    }

    makePropEditor = (typeHandler: TypeHandlerIntf, propEntry: J.PropertyInfo, allowCheckbox: boolean, rows: number): Div => {
        let tableRow = new Div();
        let allowEditAllProps: boolean = this.appState.isAdminUser;
        let isReadOnly = S.render.isReadOnlyProperty(propEntry.name);
        let editItems = [];
        let label = typeHandler ? typeHandler.getEditLabelForProp(propEntry.name) : propEntry.name;
        // console.log("making single prop editor: prop[" + propEntry.name + "] val[" + propEntry.value + "]");

        let propState: ValidatedState<any> = this.propStates.get(propEntry.name);
        if (!propState) {
            propState = new ValidatedState<any>(propEntry.value);
            this.propStates.set(propEntry.name, propState);
        }

        // WARNING: propState.setValue() calls will have been done in initStates, and should NOT be set here, because this can run during render callstacks
        // which is not a valid time to be updating states

        // todo-2: actually this is wrong to just do a Textarea when it's readonly. It might be a non-multiline item here
        // and be better with a Textfield based editor
        if (!allowEditAllProps && isReadOnly) {
            let textarea = new TextArea(label + " (read-only)", {
                readOnly: "readOnly",
                disabled: "disabled"
            }, propState);

            editItems.push(textarea);
        }
        else {
            if (allowCheckbox) {
                let checkbox: Checkbox = new Checkbox(label, null, {
                    setValue: (checked: boolean): void => {
                        let state = this.getState<LS>();
                        if (checked) {
                            state.selectedProps.add(propEntry.name);
                        }
                        else {
                            state.selectedProps.delete(propEntry.name);
                        }
                        this.deletePropButton.setEnabled(state.selectedProps.size > 0);
                    },
                    getValue: (): boolean => {
                        return this.getState<LS>().selectedProps.has(propEntry.name);
                    }
                });
                editItems.push(checkbox);
            }
            else {
                editItems.push(new Label(label));
            }

            let valEditor: CompIntf = null;
            let multiLine = rows > 1;

            if (multiLine) {
                valEditor = new TextArea(null, {
                    rows: "" + rows,
                    id: "prop_" + this.getState<LS>().node.id
                }, propState, "textarea-min-4 displayCell");
            }
            else {
                /* todo-2: eventually we will have data types, but for now we use a hack
                to detect to treat a string as a date based on its property name. */
                if (propEntry.name === J.NodeProp.DATE) {
                    valEditor = new DateTimeField(propState);
                }
                else {
                    // console.log("Creating TextField for property: " + propEntry.name + " value=" + propValStr);
                    valEditor = new TextField(null, false, null, S.props.getInputClassForType(propEntry.name), false, propState);
                }
            }

            editItems.push(valEditor as any as Comp);
        }
        tableRow.addChildren([new Div(null, null, editItems)]);
        return tableRow;
    }

    makeContentEditor = (node: J.NodeInfo, isWordWrap: boolean, rows: string): Div => {
        let value = node.content || "";
        let editItems = [];
        let encrypted = value.startsWith(J.Constant.ENC_TAG);

        // if this is the first pass thru here (not a re-render) then allow focus() to get called
        let allowFocus = !this.contentEditor;
        // console.log("making field editor for val[" + value + "]");

        this.contentEditor = new TextArea(null, {
            id: C.ID_PREFIX_EDIT + this.getState<LS>().node.id,
            rows
        }, this.contentEditorState, "font-inherit displayCell", true);

        let wrap: boolean = S.props.getNodePropVal(J.NodeProp.NOWRAP, this.appState.node) !== "1";
        this.contentEditor.setWordWrap(wrap);

        this.contentEditor.whenElm((elm: HTMLElement) => {
            if (encrypted) {
                // console.log("decrypting: " + value);
                let cipherText = value.substring(J.Constant.ENC_TAG.length);
                (async () => {
                    let cipherKey = S.props.getCryptoKey(node, this.appState);
                    if (cipherKey) {
                        let clearText: string = await S.encryption.decryptSharableString(null, { cipherKey, cipherText });

                        if (clearText == null) {
                            this.contentEditorState.setError("Decryption Failed");
                        }
                        else {
                            // console.log("decrypted to:" + value);
                            this.contentEditorState.setValue(clearText);
                        }
                    }
                })();
            }
        });

        if (allowFocus) {
            this.contentEditor.focus();
        }

        editItems.push(this.contentEditor as any as Comp);
        return new Div(null, null, editItems);
    }

    speechRecognition = (): void => {
        S.speech.setCallback((transcript: string) => {
            if (this.contentEditor && transcript) {
                // Capitalize and put period at end. This may be annoying in the long run but for now i "think"
                // I will like it? Time will tell.
                if (transcript.trim().length > 0) {
                    transcript = transcript.charAt(0).toUpperCase() + transcript.slice(1);
                    this.contentEditor.insertTextAtCursor(transcript + ". ");
                }
                else {
                    this.contentEditor.insertTextAtCursor(transcript);
                }
            }
        });

        S.speech.toggleActive();
        this.mergeState<LS>({ speechActive: S.speech.speechActive });

        setTimeout(() => {
            if (this.contentEditor) {
                this.contentEditor.focus();
            }
        }, 250);
    }

    cancelEdit = (): void => {
        this.close();

        // rollback properties.
        this.getState<LS>().node.properties = this.initialProps;

        if (this.binaryDirty) {
            S.quanta.refresh(this.appState);
        }
    }
}
