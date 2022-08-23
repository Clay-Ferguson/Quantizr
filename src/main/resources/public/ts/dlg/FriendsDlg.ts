import { CompIntf } from "../comp/base/CompIntf";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Clearfix } from "../comp/core/Clearfix";
import { Div } from "../comp/core/Div";
import { FriendsTable } from "../comp/FriendsTable";
import { DialogBase } from "../DialogBase";
import { ValueIntf } from "../Interfaces";
import * as J from "../JavaIntf";
import { S } from "../Singletons";
import { ShareToPersonDlg } from "./ShareToPersonDlg";

interface LS { // Local State
    selectedName?: string;
    loading?: boolean;
    friends?: J.FriendInfo[];
}

export class FriendsDlg extends DialogBase {

    selectionValueIntf: ValueIntf;

    constructor(private node: J.NodeInfo, private instantSelect: boolean) {
        super("Friends", "app-modal-content-medium-width");

        this.selectionValueIntf = {
            setValue: (val: string) => {
                this.mergeState<LS>({ selectedName: val });
                if (this.instantSelect) {
                    // this timeout IS required for correct state management, but is also ideal
                    // so user has a chance to see their selection get highlighted.
                    setTimeout(
                        this.close, 500);
                }
            },
            getValue: (): string => this.getState<LS>().selectedName
        };

        this.mergeState<LS>({
            loading: true
        });

        (async () => {
            const res = await S.rpcUtil.rpc<J.GetFriendsRequest, J.GetFriendsResponse>("getFriends");
            this.mergeState<LS>({
                friends: res.friends,
                loading: false
            });
        })();
    }

    renderDlg(): CompIntf[] {
        const state: LS = this.getState();
        let message = null;
        if (state.loading) {
            message = "Loading...";
        }
        else if (!state.friends || state.friends.length === 0) {
            message = "Once you add some friends you can pick from a list here, but for now you can use the button below to find people by name.";
        }

        return [
            new Div(null, null, [
                message ? new Div(message)
                    : new FriendsTable(state.friends, this.selectionValueIntf),
                new ButtonBar([
                    this.node ? new Button("Add by User Name", this.shareToPersonDlg, null, "btn-primary") : null,
                    (state.friends && !this.instantSelect) ? new Button("Choose", () => {
                        this.close();
                    }, null, "btn-primary") : null,
                    new Button("Close", this.close, null, "btn-secondary float-end")
                ], "marginTop"),
                new Clearfix() // required in case only ButtonBar children are float-end, which would break layout
            ])
        ];
    }

    shareToPersonDlg = async () => {
        const dlg = new ShareToPersonDlg(this.node, null);
        await dlg.open();

        if (dlg.userNameState.getValue()) {
            this.selectionValueIntf.setValue(dlg.userNameState.getValue());
        }
    }
}
