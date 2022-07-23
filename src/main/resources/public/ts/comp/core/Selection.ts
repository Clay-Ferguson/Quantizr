import { createElement, ReactNode } from "react";
import { store } from "../../AppRedux";
import { ValueIntf } from "../../Interfaces";
import { S } from "../../Singletons";
import { Comp } from "../base/Comp";
import { SelectionOption } from "./SelectionOption";

export class Selection extends Comp {

    constructor(attribs: any, private label: string = null, public selectionOptions: Object[] = null, moreClasses: string, private outterClasses: string, private valueIntf: ValueIntf) {
        super(attribs);
        // w-25 = width 25%
        // https://hackerthemes.com/bootstrap-cheatsheet/#m-1
        this.attribs.className = "form-select " + moreClasses;

        selectionOptions.forEach((row: any) => {
            // NOTE: for default selection we do it this way rather than the 'elm.selectedIndex' which is used to
            // to set selected item after rendered.
            this.addChild(new SelectionOption(row.key, row.val));
        });

        this.attribs.onChange = (evt: any) => {
            /*
             Special case here for mouseEffect: Selection change clicks don't have normal eventing we can use for the mouse animation so we just
             run it here an make it look like a click in the middle of the selection component, since this is done for supporting
             screencast demos this is actually much more clear anyway to display the animation on the actual selection after it's made
             */
            let state = store.getState();
            if (state.mouseEffect) {
                const { top, left } = evt.target.getBoundingClientRect();
                S.util.runClickAnimation(left + evt.target.offsetWidth / 2, top + evt.target.offsetHeight / 2);
            }

            this.updateValFunc(evt.target.value);
            // console.log("value = " + evt.target.value);
        };
    }

    // Handler to update state
    updateValFunc(value: boolean): void {
        if (value !== this.valueIntf.getValue()) {
            this.valueIntf.setValue(value);

            // needing this line took a while to figure out. If nothing is setting any actual detectable state change
            // during his call we have to do this here.
            this.forceRender();
        }
    }

    compRender = (): ReactNode => {
        this.attribs.value = this.valueIntf.getValue();
        let children = [];

        let attribsClone = { ...this.attribs };
        delete attribsClone.ref;

        if (this.label) {
            children.push(createElement("label", {
                id: this.getId() + "_label",
                key: this.getId() + "_label",
                htmlFor: this.getId(),
                className: "selectLabel"
            }, this.label));
        }

        children.push(this.tag("select", null, attribsClone));

        return createElement("div", {
            id: this.getId() + "_sel",
            key: this.getId() + "_sel",
            className: this.outterClasses || "",
            ref: this.attribs.ref
        }, children);
    }
}
