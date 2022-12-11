import { CompIntf } from "../comp/base/CompIntf";
import { FriendInfo } from "../JavaIntf";
import { Div } from "./core/Div";
import { FriendsTableRow } from "./FriendsTableRow";
import { ListBox } from "./ListBox";

export class FriendsTable extends ListBox {
    static scrollPos: number = 0;

    constructor(public friends: FriendInfo[], private searchText: string, private tagSearch: string, private selectableRows: boolean, private dlg: CompIntf) {
        super();
        const maxHeight: number = window.innerHeight > 300 ? (window.innerHeight * 0.75) : 300;
        this.attribs.className = "scrollY scrollBorder personsList";
        this.attribs.style = { maxHeight: maxHeight + "px" };
    }

    preRender(): void {
        this.searchText = this.searchText?.toLowerCase();
        this.tagSearch = this.tagSearch?.toLowerCase();

        if (this.friends) {
            const friendsComps = this.friends.map(friend => {
                if (!friend) return null;

                if ((!this.searchText || this.friendMatchesString(friend, this.searchText)) &&
                    (!this.tagSearch || this.friendMatchesString(friend, this.tagSearch))) {
                    return new FriendsTableRow(friend, this.selectableRows, this.dlg);
                }
                else {
                    return null;
                }
            });

            if (friendsComps?.length > 0) {
                this.setChildren(friendsComps);
            }
            else {
                this.setChildren([new Div("No matching users.")]);
            }
        }
    }

    friendMatchesString = (friend: FriendInfo, text: string) => {
        // console.log("match: " + text + " to " + S.util.prettyPrint(friend));

        const ret = (friend.displayName && friend.displayName.toLowerCase().indexOf(text) !== -1) || //
            (friend.userName && friend.userName.toLowerCase().indexOf(text) !== -1) || //
            (friend.tags && friend.tags.toLowerCase().indexOf(text) !== -1);

        // if (friend.tags) {
        //     debugger;
        //     console.log("indexof [" + text + "] in [" + friend.tags + "] is " + friend.tags.toLowerCase().indexOf(text));
        //     console.log("CHECK1: " + (friend.tags && friend.tags.toLowerCase().indexOf(text) !== -1));
        //     console.log("ret=" + ret);
        // }

        return ret;
    }

    getScrollPos = (): number => {
        return FriendsTable.scrollPos;
    }

    setScrollPos = (pos: number): void => {
        FriendsTable.scrollPos = pos;
    }
}
