import { Comp } from "../comp/base/Comp";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Div } from "../comp/core/Div";
import { TextContent } from "../comp/core/TextContent";
import { TextField } from "../comp/core/TextField";
import { DialogBase } from "../DialogBase";
import * as J from "../JavaIntf";
import { S } from "../Singletons";
import { ValHolder, ValidatorRuleName } from "../ValHolder";

interface LS { // Local State
    user: string;
}

export class ResetPasswordDlg extends DialogBase {

    userState: ValHolder = new ValHolder("", [{ name: ValidatorRuleName.REQUIRED }]);
    emailState: ValHolder = new ValHolder("", [{ name: ValidatorRuleName.REQUIRED }]);

    constructor(user: string) {
        super("Reset Password", "appModalContNarrowWidth");
        this.mergeState<LS>({ user });
        this.validatedStates = [this.userState, this.emailState];
    }

    renderDlg(): Comp[] {
        return [
            new Div(null, null, [
                new TextContent("Enter your user name and email address to receive a reset link."),
                new TextField({ label: "User Name", val: this.userState }),
                new TextField({ label: "Email Address", val: this.emailState }),
                new ButtonBar([
                    new Button("Reset Password", this._resetPassword, null, "-primary"),
                    new Button("Close", this._close, null, "float-right")
                ], "mt-3")
            ])
        ];
    }

    _resetPassword = async () => {
        if (!this.validate()) {
            return;
        }

        const res = await S.rpcUtil.rpc<J.ResetPasswordRequest, J.ResetPasswordResponse>("resetPassword", {
            user: this.userState.getValue(),
            email: this.emailState.getValue()
        });

        if (S.util.checkSuccess("Reset password", res)) {
            this.close();
            S.util.showMessage("Password reset email was sent. Check your email.", "Note");
        }
    }
}
