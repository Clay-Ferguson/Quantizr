import { AppState } from "../AppState";
import { Constants as C } from "../Constants";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { Div } from "./Div";
import { Li } from "./Li";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class AppTab extends Div {
    constructor(attribs: Object = {}) {
        super(null, attribs);
    }

    /* Should be overridden by concrete clases */
    public getTabButton(state: AppState): Li {
        return null;
    }

    handleClick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        S.meta64.selectTab(this.attribs.id);
    }
}
