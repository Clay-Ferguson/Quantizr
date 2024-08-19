import { dispatch, getAs } from "../AppContext";
import { Constants as C } from "../Constants";
import { DocIndexPanel } from "../DocIndexPanel";
import { MenuPanel } from "../MenuPanel";
import { S } from "../Singletons";
import { Div } from "../comp/core/Div";
import { Img } from "../comp/core/Img";
import { Span } from "../comp/core/Span";
import { NavPanelDlg } from "../dlg/NavPanelDlg";
import { TabPanelButtons } from "./TabPanelButtons";
import { Icon } from "./core/Icon";
import { IconButton } from "./core/IconButton";
import { RadioButton } from "./core/RadioButton";
import { RadioButtonGroup } from "./core/RadioButtonGroup";

export class LeftNavPanel extends Div {
    private static scrollPos: number = 0;
    public static inst: LeftNavPanel = null;

    constructor() {
        super(null, {
            id: C.ID_LHS,
            // tabIndex is required or else scrolling by arrow keys breaks.
            tabIndex: "1"
        });

        const ast = getAs();

        let cols = ast.userPrefs.mainPanelCols || 6;
        if (cols < 4) cols = 4;
        if (cols > 8) cols = 8;

        let leftCols = 4;
        if (cols >= 5) {
            leftCols--;
        }
        if (cols >= 7) {
            leftCols--;
        }

        this.attribs.className = "col-" + leftCols + (ast.tour ? " appColumnTourActive" : " appColumn");
        LeftNavPanel.inst = this;
    }

    override preRender = (): boolean => {
        const ast = getAs();
        const myMessages = ast.myNewMessageCount > 0
            ? (ast.myNewMessageCount + " new posts") : "";
        let showDocIndex = S.util.willRenderDocIndex();

        const docIndexToggle = showDocIndex ? new RadioButtonGroup([
            new Span(null, null, [
                new RadioButton("Doc Index", false, "docIndexToggle", null, {
                    setValue: (_checked: boolean) => {
                        dispatch("ToggleMenuIndex", s => {
                            s.menuIndexToggle = "index";
                        });
                    },
                    getValue: (): boolean => getAs().menuIndexToggle == "index"
                }, "form-check-inline marginRight")
            ]),
            new Span(null, null, [
                new RadioButton("Menu", false, "docIndexToggle", null, {
                    setValue: (_checked: boolean) => {
                        dispatch("ToggleMenuIndex", s => {
                            s.menuIndexToggle = "menu";
                        });
                    },
                    getValue: (): boolean => getAs().menuIndexToggle == "menu"
                }, "form-check-inline marginRight")
            ])
        ], "marginTop testRadioButtonGroup") : null;

        if (showDocIndex) {
            showDocIndex = ast.menuIndexToggle == "index";
        }

        let scrollDiv = null;
        this.children = [
            scrollDiv = new Div(null, { className: "leftNavPanel customScrollbar" }, [
                new Div(null, { id: "appLHSHeaderPanelId", className: "lhsHeaderPanel" }, [
                    new Img({
                        className: "leftNavLogoImg",
                        src: "/branding/logo-50px-tr.jpg",
                        onClick: S.util.loadAnonPageHome,
                        title: "Go to Portal Home Node"
                    }),

                    new Span(null, { className: "float-end" }, [
                        myMessages ? new Span(myMessages, {
                            className: "newMessagesNote",
                            onClick: S.nav.showMyNewMessages,
                            title: "Show your new messages"
                        }) : null,
                        ast.userName && ast.isAnonUser ? new Icon({
                            className: "fa fa-bars fa-2x clickable",
                            onClick: () => {
                                dispatch("ToggleLHS", s => {
                                    s.anonShowLHSMenu = !s.anonShowLHSMenu;
                                })
                            },
                            title: "Show Menu"
                        }) : null,
                        !ast.showRhs ? new IconButton("fa-sitemap fa-lg", null, {
                            onClick: () => new NavPanelDlg().open(),
                            id: "navMenu"
                        }, "btn-primary menuButton", "off") : null
                    ])
                ]),
                ast.isAnonUser && ast.anonShowLHSMenu ? new TabPanelButtons(true, ast.mobileMode ? "rhsMenuMobile" : "rhsMenu") : null,
                docIndexToggle,
                showDocIndex ? new DocIndexPanel() : null,
                showDocIndex ? null : new MenuPanel()
            ])
        ];

        scrollDiv.getScrollPos = (): number => {
            return LeftNavPanel.scrollPos;
        }

        scrollDiv.setScrollPos = (pos: number): void => {
            LeftNavPanel.scrollPos = pos;
        }

        return true;
    }
}