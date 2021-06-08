import { ReactNode } from "react";
import { Constants as C } from "../Constants";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { Comp } from "./base/Comp";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class NavBarButton extends Comp {

    constructor(public content: string = "", attribs: Object = {}) {
        super(attribs);
        this.attribs.type = "button";
        this.attribs.className = "btn nav-link align-middle btn-primary small-margin-right";
    }

    compRender(): ReactNode {
        let state = this.getState();
        let _style = { display: (state.visible && !state.disabled ? "" : "none") };
        let _attribs = { ...this.attribs, ...{ style: _style } };

        return this.e("button", _attribs,
            this.e("i", {
                key: "s_" + this.getId(),
                className: "fa fa-lg button-font"
            }, this.content, true)
        );
    }
}
