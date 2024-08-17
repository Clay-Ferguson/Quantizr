import { Comp } from "./base/Comp";

export class FilesTableCell extends Comp {

    constructor(content: string = null, attribs: any = {}, children: Comp[] = null) {
        super(attribs);
        this.children = children;
        this.tag = "td";
        this.content = content;
    }
}
