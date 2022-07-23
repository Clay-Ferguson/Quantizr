import { ReactNode } from "react";
import { Comp } from "../base/Comp";

interface LS { // Local State
    content: string;
}

export class Label extends Comp {

    constructor(content: string = "", attribs: Object = {}) {
        super(attribs);
        this.setText(content);
    }

    setText = (content: string) => {
        this.mergeState<LS>({ content });
    }

    compRender = (): ReactNode => {
        return this.tag("label", this.getState<LS>().content, this.attribs);
    }
}
