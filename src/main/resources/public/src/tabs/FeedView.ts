import { dispatch, getAs } from "../AppContext";
import { AppTab } from "../comp/AppTab";
import { Comp } from "../comp/base/Comp";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Clearfix } from "../comp/core/Clearfix";
import { Div } from "../comp/core/Div";
import { FlexRowLayout } from "../comp/core/FlexRowLayout";
import { Heading } from "../comp/core/Heading";
import { IconButton } from "../comp/core/IconButton";
import { Selection } from "../comp/core/Selection";
import { Spinner } from "../comp/core/Spinner";
import { TabHeading } from "../comp/core/TabHeading";
import { TextField } from "../comp/core/TextField";
import { Constants as C } from "../Constants";
import { TabIntf } from "../intf/TabIntf";
import * as J from "../JavaIntf";
import { S } from "../Singletons";
import { FeedViewProps } from "./FeedViewProps";

export class FeedView extends AppTab<FeedViewProps, FeedView> {

    constructor(data: TabIntf<FeedViewProps, FeedView>) {
        super(data);
        data.inst = this;
    }

    override preRender = (): boolean => {
        const ast = getAs();

        /*
         * Number of rows that have actually made it onto the page to far. Note: some nodes get
         * filtered out on the client side for various reasons.
         */
        let rowCount = 0;

        // const newItems: any = null;
        // if ((this.data.props.feedDirty || this.data.props.feedDirtyList) && !this.data.props.feedLoading) {
        //     newItems = new Icon({
        //         className: "fa fa-lightbulb-o fa-lg feedDirtyIcon marginRight",
        //         title: "New content available. Refresh!"
        //     });
        // }

        /* If the user has 'tagged' one or more of their Friends Nodes (by setting a tag value in
        the editor) by editing one of their friends nodes, then we show a dropdown letting the user
        quickly choose which tag/category of friends they want to see the feed of */
        let friendsTagDropDown: Selection = null;
        if (ast.friendHashTags && ast.friendHashTags.length > 0 && this.data.props.name === J.Constant.FEED_FROMFRIENDS) {
            const items: any[] = [
                { key: "", val: "All Tags" }
            ];
            for (const tag of ast.friendHashTags) {
                items.push({ key: tag, val: tag });
            }

            friendsTagDropDown = new Selection(null, null, // "Filter By Tag",
                items,
                null, "friendsTagPickerOnView", {
                setValue: (val: string) => {
                    this.data.props.friendsTagSearch = val;
                    S.srch.refreshFeed();
                },
                getValue: (): string => this.data.props.friendsTagSearch
            });
        }

        const topChildren: Comp[] = [
            new Div(null, { className: "float-end" }, [
                new FlexRowLayout([
                    //  newItems,
                    ast.displayFeedSearch || this.data.props.searchTextState.getValue() ? new TextField({
                        val: this.data.props.searchTextState,
                        placeholder: "Search for...",
                        enter: S.srch.refreshFeed,
                        outterClass: "feedSearchField marginRight"
                    }) : null,
                    // we show this button just as an icon unless the search field is displaying
                    new IconButton("fa-search", ast.displayFeedSearch ? "Search" : null, {
                        onClick: () => {
                            if (ast.displayFeedSearch) {
                                S.srch.refreshFeed()
                            }
                            else {
                                dispatch("DisplayFeedSearch", s => {
                                    s.displayFeedSearch = true;
                                });
                            }
                        },
                        title: "Search Feed"
                    }),
                    new IconButton("fa-refresh", null, {
                        onClick: S.srch.refreshFeed,
                        title: "Refresh Feed"
                    }),
                    this.data.props.searchTextState.getValue() //
                        ? new Button("Clear", () => this.clearSearch(), { className: "feedClearButton" }) : null,

                    // DO NOT DELETE (this will likely be brought back, in future design)
                    // new Checkbox("Live", { className: "bigMarginLeft" }, {
                    //     setValue: (checked: boolean) => {
                    //         // dispatch now for rapid screen refresh
                    //         dispatch("AutoRefresh", (s) => {
                    //             s.userPrefs.autoRefreshFeed = checked;
                    //         });
                    //         // save to server now
                    //         S.edit.setAutoRefreshFeed(checked);
                    //     },
                    //     getValue: (): boolean => getAs().userPrefs.autoRefreshFeed
                    // })
                ], "flexRowAlignBottom tinyMarginTop tinyMarginBottom")
            ]),
            new Clearfix()
        ];

        const children: Comp[] = [];
        children.push(new Div(null, null, topChildren));
        const childCount = this.data.props.results ? this.data.props.results.length : 0;

        if (this.data.props.feedLoading && childCount === 0) {
            children.push(new Div(null, null, [
                new Div(null, {
                    className: "progressSpinner"
                }, [new Spinner()])
            ]));
        }
        else if (this.data.props.refreshCounter === 0) {
            // if user has never done a refresh at all yet, do the first one for them automatically.
            if (ast.activeTab === C.TAB_FEED) {
                setTimeout(() => {
                    S.srch.refreshFeed();
                }, 100);
            }
            else {
                children.push(new Heading(4, "Refresh when ready."));
            }
        }
        else if (!this.data.props.results || this.data.props.results.length === 0) {
            children.push(new Div("Nothing to display."));
            if (ast.userProfile?.blockedWords) {
                children.push(new Div("Note: The 'Blocked Words' defined in your Settings can affect this view."));
            }
        }
        else {
            let i = 0;

            // finally here's where we render the feed items
            this.data.props.results.forEach(node => {
                children.push(S.srch.renderSearchResultAsListItem(node, this.data, true, true, "userFeedItem", "userFeedItemHighlight", null));
                i++;
                rowCount++;
            });

            // only show "More" button if we aren't currently editing. Wouldn't make sense to
            // navigate while editing.
            if (!ast.editNode && rowCount > 0 && !this.data.props.feedEndReached) {
                const moreButton = new IconButton("fa-angle-right", "More", {
                    onClick: (event: Event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        S.srch.feed(++this.data.props.page, this.data.props.searchTextState.getValue(), false);
                    }
                });
                const buttonCreateTime: number = new Date().getTime();

                if (C.FEED_INFINITE_SCROLL) {
                    if (this.data.props.results?.length < C.MAX_DYNAMIC_ROWS) {
                        // When the 'more' button scrolls into view go ahead and load more records.
                        moreButton.onMount((elm: HTMLElement) => {
                            const observer = new IntersectionObserver(entries => {

                                entries.forEach((entry: any) => {
                                    if (entry.isIntersecting) {
                                        // if this button comes into visibility within 2 seconds of
                                        // it being created that means it was rendered visible
                                        // without user scrolling so in this case we want to
                                        // disallow the auto loading
                                        if (new Date().getTime() - buttonCreateTime < 2000) {
                                            observer.disconnect();
                                        }
                                        else {
                                            moreButton.replaceWithWaitIcon();
                                            S.srch.feed(++this.data.props.page, this.data.props.searchTextState.getValue(), true);
                                        }
                                    }
                                });
                            });
                            observer.observe(elm);
                        });
                    }
                }
                children.push(new ButtonBar([moreButton], "text-center marginTop marginBottom"));
            }
        }

        this.children = [
            this.headingBar = new TabHeading([
                this.renderHeading(),
                new Div(null, { className: "float-end" }, [
                    ast.isAnonUser ? null : friendsTagDropDown,
                    // todo-2: we'll eventually have this as an admin option
                    // ast.isAnonUser ? null : new Button("Post", () => S.edit.addNode(null, J.NodeType.COMMENT, false, null, null, true, false), null, "btn-primary")
                ])
            ], this.data),
            new Div(null, { className: "feedView" }, children)
        ];
        return true;
    }

    /* overridable (don't use arrow function) */
    renderHeading(): Comp {
        return new Div(this.getFeedSubHeading(this.data), { className: "tabTitle" });
    }

    getFeedSubHeading = (data: TabIntf<FeedViewProps>) => {
        let subHeading = null;

        if (data.props.feedFilterToDisplayName) {
            subHeading = "Interactions with " + data.props.feedFilterToDisplayName;
        }
        else if (data.props.feedFilterToUser) {
            subHeading = "Interactions with " + data.props.feedFilterToUser;
        }
        else {
            switch (data.props.name) {
                case J.Constant.FEED_TOFROMME:
                    subHeading = "To/From Me";
                    break;

                case J.Constant.FEED_TOME:
                    subHeading = "To Me";
                    break;

                case J.Constant.FEED_FROMME:
                    subHeading = "From Me";
                    break;

                case J.Constant.FEED_FROMFRIENDS:
                    subHeading = "From Follows";
                    break;

                case J.Constant.FEED_LOCAL: 
                    subHeading = "Local Users";
                    break;

                case J.Constant.FEED_PUB:
                    subHeading = "Public Posts";
                    break;

                default: break;
            }
        }

        return subHeading ? subHeading : "";
    }

    clearSearch = () => {
        if (this.data.props.searchTextState.getValue()) {
            this.data.props.searchTextState.setValue("");
            S.srch.refreshFeed();
        }
    }

    // DO NOT DELETE - may be needed in the future.
    // makeFilterButtonsBar = (ast : AppState): Div => {
    //     return new Div(null, { className: "marginTop" }, [
    //         ast.isAnonUser ? null : new Checkbox("Friends", {
    //             title: "Include nodes posted by your friends"
    //         }, {
    //             setValue: (checked: boolean) => {
    //                 dispatch("SetFeedFilterType", s => {
    //                     this.data.props.feedFilterFriends = checked;
    //                 });
    //             },
    //             getValue: (): boolean => this.data.props.feedFilterFriends
    //         }),

    //         state.isAnonUser ? null : new Checkbox("To Me", {
    //             title: "Include nodes shares specifically to you (by name)"
    //         }, {
    //             setValue: (checked: boolean) => {
    //                 dispatch("SetFeedFilterType", s => {
    //                     this.data.props.feedFilterToMe = checked;
    //                 });
    //             },
    //             getValue: (): boolean => this.data.props.feedFilterToMe
    //         }),

    //         state.isAnonUser ? null : new Checkbox("From Me", {
    //             title: "Include nodes created by you"
    //         }, {
    //             setValue: (checked: boolean) => {
    //                 dispatch("SetFeedFilterType", s => {
    //                     this.data.props.feedFilterFromMe = checked;
    //                 });
    //             },
    //             getValue: (): boolean => this.data.props.feedFilterFromMe
    //         }),

    //         new Checkbox("Public", {
    //             title: "Include nodes shared to 'public' (everyone)"
    //         }, {
    //             setValue: (checked: boolean) => {
    //                 dispatch("SetFeedFilterType", s => {
    //                     this.data.props.feedFilterToPublic = checked;
    //                 });
    //             },
    //             getValue: (): boolean => this.data.props.feedFilterToPublic
    //         }),

    //         new Checkbox("Local", {
    //             title: "Include only nodes from accounts on this server."
    //         }, {
    //             setValue: (checked: boolean) => {
    //                 dispatch("SetFeedFilterType", s => {
    //                     this.data.props.feedFilterLocalServer = checked;

    //                     /* to help keep users probably get what they want, set 'public' also to true as the default
    //                      any time someone clicks 'Local' because that's the likely use case */
    //                     if (checked) {
    //                         this.data.props.feedFilterToPublic = true;
    //                     }
    //                 });
    //             },
    //             getValue: (): boolean => this.data.props.feedFilterLocalServer
    //         })
    //     ]);
    // }
}