import { createElement, ReactNode } from "react";
import { Comp } from "../base/Comp";

interface LS { // Local State
    expanded?: boolean;
}

export class CollapsiblePanel extends Comp {

    // todo-1: Need to switch this to the 'config' param pattern (like TextField?), there's one example already, look for cfg arg to find it.
    constructor(private collapsedButtonText: string,
        private expandedButtonText: string,
        attribs: Object = {},
        initialChildren: Comp[] = null,
        private textLink: boolean = false,
        private stateCallback: Function = null,
        expanded: boolean = false,
        private extraToggleButtonClass = "",
        private extraDivStyleExpanded: string = "",
        private extraDivStyleCollapsed: string = "",
        private elementName: string = "div") {
        super(attribs);
        this.setChildren(initialChildren);
        this.collapsedButtonText = collapsedButtonText || "More ";
        this.expandedButtonText = expandedButtonText || "Less ";
        this.mergeState<LS>({ expanded });
    }

    setExpanded(expanded: boolean) {
        this.mergeState<LS>({ expanded });
    }

    // todo-0: Some components like this one, aren't using this.attibs in the root element they return, and
    // this breaks things teh base class expects to have put in there, namely the 'ref' property.
    // Need to look over all 'compRender()' methods and fix this globally
    compRender(): ReactNode {
        let state = this.getState<LS>();
        let style = this.textLink ? "collapse-panel-link" : "btn btn-info ";
        let collapseClass = state.expanded ? "expand" : "collapse";

        /* If the component is expanded we render the button INSIDE the main area,
        which is the area that would be HIDDEN when the component is NOT expanded. */
        if (state.expanded) {
            return createElement(this.elementName, {
                key: "panel_" + this.getId(),
                className: this.extraDivStyleExpanded,
                ref: this.attribs.ref
            },
                // This div and it's children holds the actual collapsible content.
                createElement("div", {
                    className: collapseClass,
                    id: this.getId(),
                    key: "content_" + this.getId()
                },
                    // This span is the expande/collapse button itself
                    createElement("span", {
                        className: style + " " + this.extraToggleButtonClass + (state.expanded ? " icon-up" : " icon-down"),
                        // Warning: This can't be camel case!
                        "data-bs-toggle": collapseClass,
                        id: "btn_" + this.getId(),
                        key: "btn_" + this.getId(),
                        onClick: this.onToggle
                    }, state.expanded ? this.expandedButtonText : this.collapsedButtonText),
                    this.buildChildren()
                ));
        }
        else {
            return createElement(this.elementName, {
                key: "panel_" + this.getId(),
                className: this.extraDivStyleCollapsed,
                ref: this.attribs.ref
            },
                // This span is the expande/collapse button itself
                createElement("span", {
                    className: style + " " + this.extraToggleButtonClass + (state.expanded ? " icon-up" : " icon-down"),
                    // Warning: This can't be camel case!
                    "data-bs-toggle": collapseClass,
                    id: "btn_" + this.getId(),
                    key: "btn_" + this.getId(),
                    onClick: this.onToggle
                }, state.expanded ? this.expandedButtonText : this.collapsedButtonText),

                // This div and it's children holds the actual collapsible content.
                createElement("div", {
                    className: collapseClass,
                    id: this.getId(),
                    key: "content_" + this.getId()
                },
                    this.buildChildren()
                ));
        }
    }

    onToggle = (): void => {
        let expanded = !this.getState<LS>().expanded;
        this.setExpanded(expanded);
        if (this.stateCallback) {
            this.stateCallback(expanded);
        }
    }
}
