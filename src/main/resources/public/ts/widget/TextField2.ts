import { Constants as C } from "../Constants";
import * as I from "../Interfaces";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { ValidatedState } from "../ValidatedState";
import { Anchor } from "./Anchor";
import { Div } from "./Div";
import { ErrorDiv } from "./ErrorDiv";
import { Input2 } from "./Input2";
import { Label } from "./Label";
import { Span } from "./Span";
import { ToggleIcon } from "./ToggleIcon";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class TextField2 extends Div implements I.TextEditorIntf, I.ValueIntf {

    input: Input2;
    icon: ToggleIcon;

    constructor(public label: string, private isPassword: boolean, private onEnterKey: () => void, private inputClasses: string, //
        labelOnLeft: boolean, private valState: ValidatedState<any>) {
        // do not pass valState into base class, we want it to have state separately
        super(null);

        S.util.mergeProps(this.attribs, {
            name: this.getId(),
            className: "form-group" + (labelOnLeft ? " form-inline" : "")
        });

        this.mergeState({
            inputType: isPassword ? "password" : "text"
        });
    }

    setError(error: string): void {
        this.valState.setError(error);
    }

    // Overriding base class so we can focus the correct part of this composite component.
    focus(): void {
        this.whenElm((elm: HTMLSelectElement) => {
            this.input.focus();
        });
    }

    insertTextAtCursor(text: string) {
        // should we implement this ? todo-1
    }

    setWordWrap(wordWrap: boolean): void {
    }

    setMode(mode: string): void {
    }

    setValue(value: string): void {
        this.valState.setValue(value);
    }

    getValue(): string {
        return this.valState.getValue();
    }

    preRender(): void {
        let state = this.getState();

        let label = this.label ? new Label(this.label, {
            key: this.getId() + "_label",
            className: "txtFieldLabel",
            htmlFor: "inputId_" + this.getId()
        }) : null;

        let input = this.input = new Input2({
            className: "form-control pre-textfield " + (this.inputClasses || "") + (this.valState.getError() ? " validationErrorBorder" : ""),
            type: state.inputType,
            value: this.getValue(),
            id: "inputId_" + this.getId()
        }, this.valState.v);

        let passwordEye = this.isPassword ? new Span(null, {
            className: "input-group-addon"
        }, [
            new Anchor(null, null, {
                onClick: (evt) => {
                    evt.preventDefault();
                    this.mergeState({
                        inputType: state.inputType === "password" ? "text" : "password"
                    });
                    this.icon._toggleClass();
                }
            }, [
                this.icon = new ToggleIcon("fa-eye-slash", "fa-eye", {
                    className: "fa fa-lg passwordEyeIcon"
                })
            ])
        ]) : null;

        let error = new ErrorDiv({
            key: this.getId() + "_labelErr",
            className: "validationError"
        }, null, this.valState.e);

        this.setChildren([
            // NOTE: keep label outside of input-group
            label,

            new Div(null, {
                className: "input-group",
                // **** IMPORTANT ****: Yes we set font on the PARENT and then use 'inherit' to get it
                // to the component, or else there's a react-rerender flicker.
                style: { fontFamily: "monospace" }
            }, [
                input,
                passwordEye,
                error
            ])
        ]);

        if (this.onEnterKey) {
            this.input.attribs.onKeyPress = (e: KeyboardEvent) => {
                if (e.which === 13) { // 13==enter key code
                    this.onEnterKey();
                    return false;
                }
            };
        }
    }
}
