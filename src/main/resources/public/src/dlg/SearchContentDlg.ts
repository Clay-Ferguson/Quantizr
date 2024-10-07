import { dispatch, getAs } from "../AppContext";
import { DialogBase } from "../DialogBase";
import * as J from "../JavaIntf";
import { NodeInfo } from "../JavaIntf";
import { S } from "../Singletons";
import { Validator } from "../Validator";
import { Comp } from "../comp/base/Comp";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Checkbox } from "../comp/core/Checkbox";
import { Clearfix } from "../comp/core/Clearfix";
import { CollapsiblePanel } from "../comp/core/CollapsiblePanel";
import { Div } from "../comp/core/Div";
import { FlexRowLayout } from "../comp/core/FlexRowLayout";
import { IconButton } from "../comp/core/IconButton";
import { Markdown } from "../comp/core/Markdown";
import { Selection } from "../comp/core/Selection";
import { TextField } from "../comp/core/TextField";
import { ConfirmDlg } from "./ConfirmDlg";
import { SelectTagsDlg, LS as SelectTagsDlgLS } from "./SelectTagsDlg";

interface LS { // Local State
    searchRoot?: string;
    sortField?: string;
    caseSensitive?: boolean;
    fuzzy?: boolean;
    blockedWords?: boolean;
    recursive?: boolean;
    sortDir?: string;
    requirePriority?: boolean;
    requireAttachment?: boolean;
    requireDate?: boolean;
}

export class SearchContentDlg extends DialogBase {
    static defaultSearchText: string = "";
    static dlgState: any = {
        fuzzy: false,
        blockedWords: false,
        caseSensitive: false,
        recursive: true,
        sortField: "mtm",
        sortDir: "desc",
        requirePriority: false,
        requireAttachment: false,
        requireDate: false
    };

    searchTextField: TextField;
    searchTextState: Validator = new Validator();

    constructor(private searchRoot: NodeInfo = null) {
        super("Search");
        this.onMount(() => {
            this.searchTextField?.focus();
        });
        this.mergeState<LS>(SearchContentDlg.dlgState);
        this.searchTextState.setValue(SearchContentDlg.defaultSearchText);
    }

    renderDlg(): Comp[] {
        const ast = getAs();
        let requirePriorityCheckbox = null;
        if (this.getState<LS>().sortField === J.NodeProp.PRIORITY_FULL) {
            requirePriorityCheckbox = new Checkbox("Require Priority", null, {
                setValue: (checked: boolean) => {
                    SearchContentDlg.dlgState.requirePriority = checked;
                    this.mergeState<LS>({ requirePriority: checked });
                },
                getValue: (): boolean => this.getState<LS>().requirePriority
            }, "marginLeft");
        }

        return [
            new Div(null, null, [
                new Div(null, null, [
                    // new Markdown("* Use quotes to search for exact phrases. Example: \"hello world\"\n* `and` and `or` can be used between quoted phrases."),
                    this.searchTextField = new TextField({
                        label: "Enter Search Text",
                        enter: () => this.search(false),
                        val: this.searchTextState
                    }),
                    new CollapsiblePanel("Show Tips", "Hide Tips", null, [
                        new Markdown("* Use quotes to search for exact phrases. Example: \"hello world\"\n* `and` and `or` can be used between quoted phrases.")
                    ], true, (exp: boolean) => {
                        dispatch("ExpandAttachment", s => s.searchTipsExpanded = exp);
                    }, getAs().searchTipsExpanded, null, "marginTop", "marginTop")
                ]),
                this.createSearchFieldIconButtons(),
                new Clearfix(),

                new FlexRowLayout([
                    ast.userProfile?.blockedWords ? new Checkbox("Blocked Words", null, {
                        setValue: (checked: boolean) => {
                            SearchContentDlg.dlgState.blockedWords = checked;
                            this.mergeState<LS>({ blockedWords: checked });
                            if (checked) {
                                let words = ast.userProfile.blockedWords;
                                words = words.replaceAll("\n", " ");
                                words = words.replaceAll("\r", " ");
                                words = words.replaceAll("\t", " ");

                                this.searchTextState.setValue(words);
                            }
                            else {
                                this.searchTextState.setValue("");
                            }
                        },
                        getValue: (): boolean => this.getState<LS>().blockedWords
                    }, "marginTop") : null,
                    new Checkbox("Regex", null, {
                        setValue: (checked: boolean) => {
                            SearchContentDlg.dlgState.fuzzy = checked;
                            this.mergeState<LS>({ fuzzy: checked });
                        },
                        getValue: (): boolean => this.getState<LS>().fuzzy
                    }, "marginTop"),
                    new Checkbox("Case Sensitive", null, {
                        setValue: (checked: boolean) => {
                            SearchContentDlg.dlgState.caseSensitive = checked;
                            this.mergeState<LS>({ caseSensitive: checked });
                        },
                        getValue: (): boolean => this.getState<LS>().caseSensitive
                    }, "marginTop"),
                    new Checkbox("Recursive", null, {
                        setValue: (checked: boolean) => {
                            SearchContentDlg.dlgState.recursive = checked;
                            this.mergeState<LS>({ recursive: checked });
                        },
                        getValue: (): boolean => this.getState<LS>().recursive
                    }, "marginTop"),
                    new Checkbox("Has Attachment", null, {
                        setValue: (checked: boolean) => {
                            SearchContentDlg.dlgState.requireAttachment = checked;
                            this.mergeState<LS>({ requireAttachment: checked });
                        },
                        getValue: (): boolean => this.getState<LS>().requireAttachment
                    }, "marginTop"),
                    new Checkbox("Has Date", null, {
                        setValue: (checked: boolean) => {
                            SearchContentDlg.dlgState.requireDate = checked;
                            this.mergeState<LS>({ requireDate: checked });
                        },
                        getValue: (): boolean => this.getState<LS>().requireDate
                    }, "marginTop")
                ], "marginBottom"),

                new FlexRowLayout([
                    new Selection(null, "Search in", [
                        { key: J.Constant.SEARCH_CUR_NODE, val: "Current Node" },
                        { key: J.Constant.SEARCH_ALL_NODES, val: "My Account" }
                    ], null, "searchDlgSearchRoot", {
                        setValue: (val: string) => {
                            SearchContentDlg.dlgState.searchRoot = val;

                            this.mergeState<LS>({
                                searchRoot: val
                            });
                        },
                        getValue: (): string => this.getState<LS>().searchRoot
                    }),
                    new Div(null, null, [
                        new Selection(null, "Sort by", [
                            { key: "mtm", val: "Modify Time" },
                            { key: "ctm", val: "Create Time" },
                            { key: "contentLength", val: "Text Length" },
                            { key: "treeDepth", val: "Tree Depth" },
                            { key: J.NodeProp.PRIORITY_FULL, val: "Priority" }
                        ], null, "searchDlgOrderBy", {
                            setValue: (val: string) => {
                                let sortDir = "DESC";
                                if (val === J.NodeProp.PRIORITY_FULL) {
                                    sortDir = "asc";
                                }
                                SearchContentDlg.dlgState.sortField = val;
                                SearchContentDlg.dlgState.sortDir = sortDir;

                                const newState: LS = {
                                    sortField: val,
                                    sortDir
                                }
                                if (val === J.NodeProp.PRIORITY_FULL) {
                                    newState.requirePriority = true;
                                }
                                this.mergeState<LS>(newState);
                            },
                            getValue: (): string => this.getState<LS>().sortField
                        })
                    ]),
                    new Div(null, null, [
                        requirePriorityCheckbox
                    ])
                ], "bigMarginBottom"),

                new ButtonBar([
                    new Button("Search", () => this.search(false), null, "btn-primary"),
                    new Button("Graph", this._graph),
                    // todo-2: this is currently not implemented on the server.
                    // ast.isAdminUser ? new Button("Delete Matches", this.deleteMatches, null, "btn-danger") : null,
                    new Button("Close", this._close, null, "btn-secondary float-end")
                ], "marginTop")
            ])
        ];
    }

    createSearchFieldIconButtons(): Comp {
        return new ButtonBar([
            new Button("Clear", () => {
                this.searchTextState.setValue("");
                dispatch("clearSearch", s => {
                    s.highlightText = null;
                })
            }),
            !getAs().isAnonUser ? new IconButton("fa-tag fa-lg", "", {
                onClick: async () => {
                    const dlg = new SelectTagsDlg("search", this.searchTextState.getValue(), true);
                    await dlg.open();
                    this.addTagsToSearchField(dlg);
                },
                title: "Select Hashtags to Search"
            }, "btn-primary", "off") : null
        ], "float-end tinyMarginTop");
    }

    addTagsToSearchField(dlg: SelectTagsDlg) {
        let val = this.searchTextState.getValue();
        val = val.trim();
        const tags: string[] = val.split(" ");

        dlg.getState<SelectTagsDlgLS>().selectedTags.forEach(mtag => {
            const amtags: string[] = mtag.split(" ");
            amtags.forEach(tag => {
                const quoteTag = "\"" + tag + "\"";
                if (!tags.includes(quoteTag)) {
                    if (val) val += " ";
                    val += quoteTag;
                    tags.push(quoteTag);
                }
            });
        });
        this.searchTextState.setValue(SearchContentDlg.defaultSearchText = val);
    }

    _graph = () => {
        const node = this.searchRoot || S.nodeUtil.getHighlightedNode();
        if (!node) {
            S.util.showMessage("No node is selected to search under.", "Warning");
            return;
        }

        SearchContentDlg.defaultSearchText = this.searchTextState.getValue();
        this.close();
        S.render.showGraph(null, SearchContentDlg.defaultSearchText);
    }

    // currently not used.
    _deleteMatches = async () => {
        const dlg = new ConfirmDlg("Permanently delete ALL MATCHING Nodes", "WARNING",
            "btn-danger", "alert alert-danger");
        await dlg.open();
        if (dlg.yes) {
            this.search(true);
        }
    }

    async search(deleteMatches: boolean) {
        const node = this.searchRoot || S.nodeUtil.getHighlightedNode();
        if (!node) {
            S.util.showMessage("No node is selected to search under.", "Warning");
            return;
        }

        SearchContentDlg.defaultSearchText = this.searchTextState.getValue();
        const desc = SearchContentDlg.defaultSearchText ? ("Content: " + SearchContentDlg.defaultSearchText) : "";
        const state = this.getState<LS>();

        let requirePriority = state.requirePriority;
        if (state.sortField !== J.NodeProp.PRIORITY_FULL) {
            requirePriority = false;
        }

        // If we're deleting matches
        if (SearchContentDlg.defaultSearchText?.trim().length < 5 && deleteMatches) {
            return;
        }

        const success = await S.srch.search(node.id, null, SearchContentDlg.defaultSearchText, null, desc,
            state.searchRoot,
            state.fuzzy,
            state.caseSensitive, 0,
            state.recursive,
            state.sortField,
            state.sortDir,
            requirePriority,
            state.requireAttachment,
            deleteMatches,
            false,
            state.requireDate);
        if (success) {
            this.close();
        }
    }
}
