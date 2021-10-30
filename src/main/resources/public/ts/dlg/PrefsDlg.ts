import { AppState } from "../AppState";
import { Constants as C } from "../Constants";
import { DialogBase } from "../DialogBase";
import * as J from "../JavaIntf";
import { PubSub } from "../PubSub";
import { Singletons } from "../Singletons";
import { CompIntf } from "../widget/base/CompIntf";
import { Button } from "../widget/Button";
import { ButtonBar } from "../widget/ButtonBar";
import { Checkbox } from "../widget/Checkbox";
import { Form } from "../widget/Form";
import { HorizontalLayout } from "../widget/HorizontalLayout";

let S: Singletons;
PubSub.sub(C.PUBSUB_SingletonsReady, (ctx: Singletons) => {
    S = ctx;
});

export class PrefsDlg extends DialogBase {

    constructor(state: AppState) {
        super("Preferences", null, false, state);
    }

    renderDlg(): CompIntf[] {
        return [
            new Form(null, [
                new HorizontalLayout([
                    new Checkbox("Show Node Metadata", null, {
                        setValue: (checked: boolean): void => {
                            this.appState.userPreferences.showMetaData = checked;
                        },
                        getValue: (): boolean => {
                            return this.appState.userPreferences.showMetaData;
                        }
                    })
                ]),
                new ButtonBar([
                    new Button("Save", this.savePreferences, null, "btn-primary"),
                    new Button("Cancel", this.close)
                ], "marginTop")
            ])
        ];
    }

    savePreferences = (): void => {
        if (!this.appState.isAnonUser) {
            S.util.ajax<J.SaveUserPreferencesRequest, J.SaveUserPreferencesResponse>("saveUserPreferences", {
                userPreferences: {
                    editMode: this.appState.userPreferences.editMode,
                    showMetaData: this.appState.userPreferences.showMetaData,
                    rssHeadlinesOnly: this.appState.userPreferences.rssHeadlinesOnly,
                    maxUploadFileSize: -1,
                    enableIPSM: false // we never need to enable this here. Only the menu can trigger it to set for now.
                }
            }, this.savePreferencesResponse);
        }
        this.close();
    }

    savePreferencesResponse = (res: J.SaveUserPreferencesResponse): void => {
        if (S.util.checkSuccess("Saving Preferences", res)) {
            S.quanta.refresh(this.appState);
        }
    }
}
