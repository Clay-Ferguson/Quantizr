import { SchemaOrgProp } from "../JavaIntf";
import { Div } from "./core/Div";
import { ListBox } from "./ListBox";
import { SchemaOrgPropsTableRow } from "./SchemaOrgPropsTableRow";

export class SchemaOrgPropsTable extends ListBox {
    static scrollPos: number = 0;

    constructor(public props: SchemaOrgProp[]) {
        super();
        const maxHeight: number = window.innerHeight > 300 ? (window.innerHeight * 0.5) : 300;
        this.attribs.className = "scrollY scrollBorder propsList customScrollbar";
        this.attribs.style = { maxHeight: maxHeight + "px" };
    }

    preRender(): void {
        if (this.props) {
            const comps = this.props.map(prop => {
                if (!prop) return null;
                return new SchemaOrgPropsTableRow(prop);
            });

            if (comps?.length > 0) {
                this.setChildren(comps);
            }
            else {
                this.setChildren([new Div("No properties.")]);
            }
        }
    }

    getScrollPos = (): number => {
        return SchemaOrgPropsTable.scrollPos;
    }

    setScrollPos = (pos: number): void => {
        SchemaOrgPropsTable.scrollPos = pos;
    }
}
