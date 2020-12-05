import axios from "axios";
import * as RssParser from "rss-parser";
import { dispatch } from "../AppRedux";
import { AppState } from "../AppState";
import { Constants as C } from "../Constants";
import { AudioPlayerDlg } from "../dlg/AudioPlayerDlg";
import { NodeActionType } from "../enums/NodeActionType";
import * as J from "../JavaIntf";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { Anchor } from "../widget/Anchor";
import { Comp } from "../widget/base/Comp";
import { CompIntf } from "../widget/base/CompIntf";
import { Button } from "../widget/Button";
import { ButtonBar } from "../widget/ButtonBar";
import { Div } from "../widget/Div";
import { Heading } from "../widget/Heading";
import { Img } from "../widget/Img";
import { Html } from "../widget/Html";
import { TextContent } from "../widget/TextContent";
import { TypeBase } from "./base/TypeBase";
import { Span } from "../widget/Span";
import { Log } from "../Log";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class RssTypeHandler extends TypeBase {

    // NOTE: Same value appears in RSSFeedService.ts
    static MAX_FEED_ITEMS: number = 200;

    constructor() {
        super(J.NodeType.RSS_FEED, "RSS Feed", "fa-rss", true);
    }

    allowAction(action: NodeActionType, node: J.NodeInfo, appState: AppState): boolean {
        switch (action) {
            case NodeActionType.upload:
                return false;
            default:
                return true;
        }
    }

    getEditLabelForProp(propName: string): string {
        if (propName === J.NodeProp.RSS_FEED_SRC) {
            return "RSS Feed URLs (one per line)";
        }
        return propName;
    }

    getEditorRowsForProp(propName: string): number {
        if (propName === J.NodeProp.RSS_FEED_SRC) {
            return 20;
        }
        return 1;
    }

    getAllowPropertyAdd(): boolean {
        return false;
    }

    getAllowContentEdit(): boolean {
        return false;
    }

    getCustomProperties(): string[] {
        return [J.NodeProp.RSS_FEED_SRC];
    }

    allowPropertyEdit(propName: string, state: AppState): boolean {
        return propName === J.NodeProp.RSS_FEED_SRC;
    }

    ensureDefaultProperties(node: J.NodeInfo) {
        this.ensureStringPropExists(node, J.NodeProp.RSS_FEED_SRC);
    }

    render(node: J.NodeInfo, rowStyling: boolean, state: AppState): Comp {

        let feedSrc: string = S.props.getNodePropVal(J.NodeProp.RSS_FEED_SRC, node);
        if (!feedSrc) {
            return (new TextContent("Set the '" + J.NodeProp.RSS_FEED_SRC + "' node property to the RSS Feed URL.", "alert alert-info marginLeft marginTop"));
        }

        let feedSrcHash = S.util.hashOfString(feedSrc);
        let content = node.content;
        let itemListContainer: Div = new Div("", { className: "rss-feed-listing" }, [
            new Heading(3, content)
        ]);

        let parser = new RssParser({
            customFields: {
                item: [
                    ["podcast:chapters", "podcastChapters"],
                    ["media:thumbnail", "mediaThumbnail"],
                    ["category", "category"],
                    ["itunes:image", "itunesImage"],
                    ["itunes:subtitle", "itunesSubtitle"]
                ]
            }
        });

        /*
        If we find the RSS feed in the cache, use it.
        disabling cache for now: somehow the "Play Button" never works (onClick not wired) whenever it renders from the cache and i haven't had time to
        figure this out yet.
        */
        if (state.feedCache[feedSrcHash] === "failed") {
            return new Div("Feed Failed: " + feedSrc, {
                className: "marginAll"
            });
        }
        else if (state.feedCache[feedSrcHash] === "loading") {
            // todo-1: I tried to put "new Progress()" as a child but it doesn't render. never tried to troubleshoot.
            return new Div("Loading Feeds...", {
                className: "marginAll"
            });
        }
        else if (state.feedCache[feedSrcHash]) {
            this.renderItem(state.feedCache[feedSrcHash], feedSrc, itemListContainer, state);
        }
        // otherwise read from the internet
        else {
            state.feedCache[feedSrcHash] = "loading";

            itemListContainer.addChild(new Div("Loading RSS Feed..."));
            itemListContainer.addChild(new Div("(For large feeds this can take a few seconds)"));

            let url = S.util.getRemoteHost() + "/multiRssFeed?url=" + encodeURIComponent(feedSrc);

            // console.log("Reading RSS: " + url);
            parser.parseURL(url, (err, feed) => {
                if (!feed) {
                    // new MessageDlg(err.message || "RSS Feed failed to load.", "Warning", null, null, false, 0, state).open();
                    // console.log(err.message || "RSS Feed failed to load.");
                    dispatch({
                        type: "Action_RSSUpdated",
                        state,
                        update: (s: AppState): void => {
                            s.feedCache[feedSrcHash] = "failed";
                        }
                    });
                }
                else {
                    dispatch({
                        type: "Action_RSSUpdated",
                        state,
                        update: (s: AppState): void => {
                            s.feedCache[feedSrcHash] = feed;
                        }
                    });
                }
            });
        }
        return itemListContainer;
    }

    renderItem(feed: any, feedSrc: string, itemListContainer: Comp, state: AppState) {
        let feedOut: Comp[] = [];

        // console.log("FEED: " + S.util.prettyPrint(feed));

        if (feed.image) {
            feedOut.push(new Img(null, {
                className: "rss-feed-image",
                src: feed.image.url,
                title: feed.image.title,
                align: "left" // causes text to flow around
            }));
        }
        else if (feed.itunes && feed.itunes.image) {
            feedOut.push(new Img(null, {
                className: "rss-feed-image",
                src: feed.itunes.image,
                align: "left" // causes text to flow around
            }));
        }

        if (feed.title) {
            if (feed.link) {
                feedOut.push(new Anchor(feed.link, feed.title, {
                    style: { fontSize: "45px" },
                    target: "_blank"
                }));
            }
            else {
                feedOut.push(new Span(feed.title, {
                    style: { fontSize: "45px" }
                }));
            }
        }

        feedOut.push(new Div(null, { className: "clearBoth" }));

        if (feed.description) {
            feedOut.push(new Html(feed.description));
        }

        // A bit of a hack to avoid showing the feed URL of our own aggregate feeds. We could publish this but no need to and
        // is even undesirable for now. Also the newline check is to not show the feed urls if this is a multi RSS feed one
        if (feedSrc.indexOf("/multiRss?id=") === -1 && feedSrc.indexOf("\n") === -1) {
            feedOut.push(new Div(feedSrc));
        }

        if (feed.creator) {
            feedOut.push(new Div(feed.creator));
        }

        let feedOutDiv = new Div(null, null, feedOut);
        itemListContainer.getChildren().push(feedOutDiv);
        let itemCount = 0;

        for (let item of feed.items) {
            itemListContainer.getChildren().push(this.buildFeedItem(feed, item, state));
            if (++itemCount >= RssTypeHandler.MAX_FEED_ITEMS) {
                break;
            }
        }
    }

    buildFeedItem(feed: any, entry: any, state: AppState): Comp {
        let children: Comp[] = [];
        let headerDivChildren = [];

        if (entry.mediaThumbnail && entry.mediaThumbnail.$) {
            let style: any = {};

            if (entry.mediaThumbnail.$.width) {
                style.width = entry.mediaThumbnail.$.width + "px";
            }

            if (entry.mediaThumbnail.$.height) {
                style.height = entry.mediaThumbnail.$.height + "px";
            }

            headerDivChildren.push(new Img(null, {
                style,
                className: "rss-feed-image",
                src: entry.mediaThumbnail.$.url,
                align: "left" // causes text to flow around
            }));
        }
        else if (entry.itunesImage && entry.itunesImage.$) {
            headerDivChildren.push(new Img(null, {
                className: "rss-feed-image",
                src: entry.itunesImage.$.href,
                align: "left" // causes text to flow around
            }));
        }

        if (entry.category) {
            headerDivChildren.push(new Div(entry.category));
        }

        let colonIdx = entry.title.indexOf(" :: ");
        if (colonIdx !== -1) {
            let headerPart = entry.title.substring(0, colonIdx);
            headerDivChildren.push(new Heading(4, headerPart));

            let title = entry.title.substring(colonIdx + 4);
            headerDivChildren.push(new Anchor(entry.link, title, {
                className: "rssAnchor",
                target: "_blank"
            }));
        }
        else {
            headerDivChildren.push(new Anchor(entry.link, entry.title, {
                className: "rssAnchor",
                target: "_blank"
            }));
        }

        if (entry.itunesSubtitle && entry.itunesSubtitle !== entry.title) {
            // ignore jank subtitles
            if (entry.itunesSubtitle.indexOf("&amp;") === -1 && entry.itunesSubtitle.indexOf("&quot;") === -1) {
                headerDivChildren.push(new Div(entry.itunesSubtitle));
            }
        }

        children.push(new Div(null, null, headerDivChildren));

        if (entry.enclosure && entry.enclosure.url && entry.enclosure.type &&
            entry.enclosure.type.indexOf("audio/") !== -1) {

            let downloadLink = new Anchor(entry.enclosure.url, "[ Download " + entry.enclosure.type + " ]", { className: "rssDownloadLink" }, null, true);

            let audioButton = new Button("Play Audio", //
                () => {
                    let chaptersUrl = (entry.podcastChapters && entry.podcastChapters.$) ? entry.podcastChapters.$.url : null;
                    let chaptersDiv = null;
                    if (chaptersUrl) {
                        chaptersDiv = new Div(null, { className: "rssChapterPanel" });
                        chaptersDiv.preRender = () => {
                            this.renderChapters(dlg, chaptersDiv);
                        };
                    }

                    let dlg = new AudioPlayerDlg(feed.title, entry.title, chaptersDiv, entry.enclosure.url, state);
                    dlg.open();

                    if (chaptersDiv) {
                        this.asyncLoadChapters(chaptersDiv, chaptersUrl);
                    }
                });

            children.push(new ButtonBar([audioButton, downloadLink], null, "rssMediaButtons"));
        }

        children.push(new Div(null, { className: "clearBoth" }));

        if (entry["content:encoded"]) {
            /* set the dangerously flag for this stuff and render as html */
            let contentDiv = new Html(entry["content:encoded"]);
            children.push(contentDiv);
        }
        else if (entry.contentSnippet) {
            let contentDiv = new Html(entry.contentSnippet);
            children.push(contentDiv);
        }

        let dateStr = entry.pubDate;
        if (entry.isoDate) {
            let date = Date.parse(entry.isoDate);
            if (date) {
                dateStr = S.util.formatDateShort(new Date(date));
            }
        }
        children.push(new Div(dateStr, { className: "float-right" }));
        children.push(new Div(null, { className: "clearfix" }));

        return new Div(null, { className: "rss-feed-item" }, children);
    }

    renderChapters = (chaptersDiv: AudioPlayerDlg, div: CompIntf): void => {
        let state = div.getState();
        div.setChildren([]);

        if (state.chapters) {
            for (let chapter of state.chapters.chapters) {

                let chapterDiv = new Div();
                if (chapter.img) {
                    chapterDiv.addChild(new Img(null, {
                        className: "rssChapterImage",
                        src: chapter.img,
                        onClick: () => {
                            if (chaptersDiv.player) {
                                chaptersDiv.player.currentTime = chapter.startTime;
                            }
                        }
                    }));
                }

                chapterDiv.addChild(new Span(chapter.title, {
                    className: "rssChapterTitle",
                    onClick: () => {
                        if (chaptersDiv.player) {
                            chaptersDiv.player.currentTime = chapter.startTime;
                        }
                    }
                }));

                if (chapter.url) {
                    chapterDiv.addChild(new Anchor(chapter.url, "[ Link ]", {
                        className: "rssChapterLink",
                        target: "_blank"
                    }));
                }

                div.addChild(chapterDiv);
            }
        }
    }

    asyncLoadChapters = async (chaptersDiv: Div, chaptersUrl: string) => {
        console.log("chapters: " + chaptersUrl);
        if (!chaptersUrl) return null;

        let url = S.util.getRemoteHost() + "/proxyGet?url=" + encodeURIComponent(chaptersUrl);

        try {
            let response = await axios.get(url, {});
            if (response.status === 200) {
                chaptersDiv.mergeState({ chapters: response.data });
            }
        }
        catch (e) {
            Log.error(e);
        }
    }

    /* This will process all the images loaded by the RSS Feed content to make sure they're all 300px wide because
    otherwise we get rediculously large images */
    getDomPreUpdateFunction(parent: CompIntf): void {
        S.util.forEachElmBySel("#" + parent.getId() + " .rss-feed-listing img", (el: HTMLElement, i) => {
            el.style.borderRadius = ".6em";
            el.style.border = "1px solid gray";

            /* Setting width to 100% and always removing height ensures the image does fit into our colum display
            and also will not stretch */
            el.style.maxWidth = "100%";
            delete el.style.width;
            el.removeAttribute("height");
        });
        S.util.forEachElmBySel("#" + parent.getId() + " .rss-feed-image", (el, i) => {
            el.style.maxWidth = "25%";
        });
    }
}
