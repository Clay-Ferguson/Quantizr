import { dispatch, getAs } from "../AppContext";
import { CompIntf } from "../comp/base/CompIntf";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Checkbox } from "../comp/core/Checkbox";
import { Div } from "../comp/core/Div";
import { TextField } from "../comp/core/TextField";
import { NodeTypeListBox } from "../comp/NodeTypeListBox";
import { DialogBase } from "../DialogBase";
import { ValueIntf } from "../Interfaces";
import * as J from "../JavaIntf";
import { Validator } from "../Validator";

interface LS { // Local State
    selType?: string;
}

export class PickNodeTypeDlg extends DialogBase {

    searchTextState: Validator = new Validator();
    searchTextField: TextField;

    valIntf: ValueIntf;
    chosenType: string = null;
    inlineButton: Button;

    static inst: PickNodeTypeDlg = null;
    static searchDirty = false;
    static dirtyCounter = 0;
    static interval = setInterval(() => {
        if (!PickNodeTypeDlg.inst) return;
        if (PickNodeTypeDlg.searchDirty) {
            PickNodeTypeDlg.dirtyCounter++;
            if (PickNodeTypeDlg.dirtyCounter >= 2) {
                PickNodeTypeDlg.searchDirty = false;
                setTimeout(PickNodeTypeDlg.inst.typeSearch, 10);
            }
        }
    }, 500);

    constructor(curType: string) {
        super("Set Node Type", "app-modal-content-narrow-width");
        PickNodeTypeDlg.inst = this;

        this.valIntf = {
            setValue: (val: string) => this.mergeState<LS>({ selType: val }),
            getValue: (): string => this.getState<LS>().selType
        };

        this.mergeState<LS>({ selType: curType || J.NodeType.NONE });

        this.searchTextState.v.onStateChange = (val: any) => {
            PickNodeTypeDlg.searchDirty = true;
            PickNodeTypeDlg.dirtyCounter = 0;
        };
    }

    renderDlg(): CompIntf[] {
        return [
            new Div(null, null, [
                (this.searchTextField = new TextField({
                    labelClass: "txtFieldLabelShort",
                    val: this.searchTextState,
                    placeholder: "Search for...",
                    enter: this.typeSearch,
                    outterClass: "typeSearchField"
                })),
                new Checkbox("Schema.org Props", { className: "marginRight" }, {
                    setValue: (checked: boolean) => dispatch("SetSchemaOrgProps", s => { s.schemaOrgProps = checked; }),
                    getValue: (): boolean => getAs().schemaOrgProps
                }),
                new NodeTypeListBox(this.valIntf, this.searchTextState.getValue()),
                new ButtonBar([
                    new Button("Set Type", this.setNodeType, null, "btn-primary"),
                    new Button("Cancel", this.close)
                ], "marginTop")
            ])
        ];
    }

    typeSearch = () => {
        this.mergeState<LS>({});
        // warning: keep the fat arrow function here.
        setTimeout(() => this.searchTextField.focus(), 50);
    }

    setNodeType = () => {
        this.chosenType = this.getState<LS>().selType;
        this.close();
    }
}
