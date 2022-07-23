import { ReactNode } from "react";
import { Comp } from "./base/Comp";
import { PropTableCell } from "./PropTableCell";

export class PropTableRow extends Comp {

    constructor(attribs: Object = {}, initialChildren: PropTableCell[] = null) {
        super(attribs);
        this.setChildren(initialChildren);
    }

    compRender = (): ReactNode => {
        return this.tag("tr", null, this.attribs);
    }
}
