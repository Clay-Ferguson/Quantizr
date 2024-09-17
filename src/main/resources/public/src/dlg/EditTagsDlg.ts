import { dispatch, getAs } from "../AppContext";
import { Comp, ScrollPos } from "../comp/base/Comp";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Div } from "../comp/core/Div";
import { TextArea } from "../comp/core/TextArea";
import { DialogBase } from "../DialogBase";
import * as J from "../JavaIntf";
import { S } from "../Singletons";
import { Validator } from "../Validator";

export class EditTagsDlg extends DialogBase {
    tagsState: Validator = new Validator();
    textScrollPos = new ScrollPos();

    constructor() {
        super("Edit Hashtags", "appModalContMediumWidth");
    }

    renderDlg(): Comp[] {
        return [
            new Div(null, null, [
                new Div("Enter custom hashtags, each on a separate line below. Hashtags must start with #."),
                new TextArea("Hashtags", { rows: 15 }, this.tagsState, null, false, 3, this.textScrollPos),
                new ButtonBar([
                    new Button("Save", this._save, null, "btn-primary"),
                    new Button("Close", this._close, null, "btn-secondary float-end")
                ], "marginTop")
            ])
        ];
    }

    async reload() {
        const res = await S.rpcUtil.rpc<J.GetUserProfileRequest, J.GetUserProfileResponse>("getUserProfile", {
            userId: getAs().userProfile.userNodeId
        });

        if (res?.userProfile) {
            this.tagsState.setValue(res.userProfile.userTags);
        }
    }

    _save = () => {
        const ast = getAs();
        ast.userProfile.userTags = this.tagsState.getValue();

        dispatch("SetUserProfile", s => {
            s.userProfile = ast.userProfile;
        });

        S.rpcUtil.rpc<J.SaveUserProfileRequest, J.SaveUserProfileResponse>("saveUserProfile", {
            userName: null,
            userTags: ast.userProfile.userTags,
            blockedWords: ast.userProfile.blockedWords,
            userBio: ast.userProfile.userBio,
            displayName: ast.userProfile.displayName,
            recentTypes: ast.userProfile.recentTypes
        });
        this.close();
    }

    override async preLoad(): Promise<void> {
        await this.reload();
    }
}
