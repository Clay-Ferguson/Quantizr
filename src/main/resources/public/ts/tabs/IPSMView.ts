import { AppTab } from "../comp/AppTab";
import { Comp } from "../comp/base/Comp";
import { CompIntf } from "../comp/base/CompIntf";
import { Div } from "../comp/core/Div";
import { TabIntf } from "../intf/TabIntf";

export class IPSMView extends AppTab<any, IPSMView> {
    constructor(data: TabIntf<any, IPSMView>) {
        super(data);
        data.inst = this;
    }

    preRender(): void {
        const children: Comp[] = [];

        children.push(new Div(null, null, [
            new Div(null, { className: "marginTop" }, [
                this.renderHeading()
            ]),
            new Div("Realtime IPFS PubSub events from ipsm-heartbeat topic...")
        ]));

        if (this.data.props?.events) {
            this.data.props.events.forEach((e: string) => children.push(new Div(e, { className: "ipsmFeedItem" })));
        }

        this.setChildren([new Div(null, { className: "feedView" }, children)]);
    }

    /* overridable (don't use arrow function) */
    renderHeading(): CompIntf {
        return new Div("IPSM Console", { className: "tabTitle" });
    }
}
