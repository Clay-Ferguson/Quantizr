import { ReactNode } from "react";
import { Comp } from "../base/Comp";

export class SelectionOption extends Comp {
    constructor(public key: string, public val: string) {
        super(null);
        this.attribs.value = this.key;
    }

    compRender = (): ReactNode => {
        return this.tag("option", null, [this.val]);
    }
}
