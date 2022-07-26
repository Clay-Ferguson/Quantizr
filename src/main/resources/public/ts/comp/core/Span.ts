import { ReactNode } from "react";
import { Comp } from "../base/Comp";

export class Span extends Comp {
    constructor(public content: string = "", attribs: Object = {}, initialChildren: Comp[] = null, private rawHtml: boolean = false) {
        super(attribs);
        this.setChildren(initialChildren);
    }

    compRender = (): ReactNode => {
        if (this.rawHtml) {
            this.attribs.dangerouslySetInnerHTML = Comp.getDangerousHtml(this.content);
            return this.tag("span");
        }
        else {
            return this.tag("span", null, this.getChildrenWithFirst(this.content));
        }
    }
}
