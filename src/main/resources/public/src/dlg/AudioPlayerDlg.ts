import { getAs } from "../AppContext";
import { Comp } from "../comp/base/Comp";
import { AudioPlayer } from "../comp/core/AudioPlayer";
import { Button } from "../comp/core/Button";
import { ButtonBar } from "../comp/core/ButtonBar";
import { Div } from "../comp/core/Div";
import { Icon } from "../comp/core/Icon";
import { TextField } from "../comp/core/TextField";
import { DialogBase } from "../DialogBase";
import * as I from "../Interfaces";
import * as J from "../JavaIntf";
import { S } from "../Singletons";
import { Validator } from "../Validator";

// todo-0: I'll leave this class here for reference, for now, 
// but it's all been moved into AVView (a Tab), and so this class will be deleted soon
export class AudioPlayerDlg extends DialogBase {

    player: HTMLAudioElement;
    audioPlayer: AudioPlayer;
    startTimePending: number = null;

    /*
    If the 'adSegments' array variable below contains an array of start/stop times then during
    playback this player will seamlessly and autmatically jump over those time ranges in the audio
    during playing just like they didn't even exist, basically censoring out those time ranges.
    Currently we aren't using this at all, because it's not friendly to the podcasting industry!
    */
    private adSegments: I.AdSegment[] = null;
    private saveTimer: any = null;
    urlHash: string;

    timeLeftTextField: TextField;
    timeLeftState: Validator = new Validator();

    intervalTimer: any;
    playButton: Icon;
    pauseButton: Icon;

    constructor(customTitle: string, private customSubTitle: string, private customDiv: Comp, private sourceUrl: string, private startTimePendingOverride: number,
        private playingMemoryBlob: boolean) {
        super(customTitle || "Audio Player");
        this.urlHash = S.util.hashOfString(sourceUrl);
        this.startTimePending = localStorage[this.urlHash];
        this.intervalTimer = setInterval(() => {
            this.oneMinuteTimeslice();
        }, 60000);

        setTimeout(() => {
            this.updatePlayButton();
        }, 750);
    }

    override preUnmount(): any {
        S.quanta.audioPlaying = false;
        if (this.intervalTimer) {
            clearInterval(this.intervalTimer);
        }

        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }
    }

    // This makes the sleep timer work "Stop After (mins.)"
    oneMinuteTimeslice = () => {
        if (!S.quanta.audioPlaying) return;
        if (this.timeLeftState.getValue()) {
            try {
                let timeVal = parseInt(this.timeLeftState.getValue());
                timeVal--;
                this.timeLeftState.setValue(timeVal <= 0 ? "" : "" + timeVal);
                if (timeVal <= 0 && this.player && !this.player.paused && !this.player.ended) {
                    this.player.pause();
                }
            }
            catch (e) {
                // ignore
            }
        }
    }

    renderDlg(): Comp[] {
        const children = [
            new Div(null, null, [
                this.customSubTitle ? new Div(this.customSubTitle, { className: "dialogSubTitle" }) : null,
                this.audioPlayer = new AudioPlayer({
                    src: this.sourceUrl,
                    className: "audioPlayer",
                    onPause: () => { this.savePlayerInfo(this.player.src, this.player.currentTime); },
                    onTimeUpdate: this.onTimeUpdate,
                    onCanPlay: this.restoreStartTime,
                    onEnded: this.onEnded,
                    controls: "controls",
                    autoPlay: "autoplay",
                    preload: "auto",
                    controlsList: "nodownload"
                }),
                new Div(null, { className: "row" }, [
                    new ButtonBar([
                        new Button("1x", () => {
                            this.speed(1);
                        }),
                        new Button("1.25x", () => {
                            this.speed(1.25);
                        }),
                        new Button("1.5x", () => {
                            this.speed(1.5);
                        }),
                        new Button("1.75x", () => {
                            this.speed(1.75);
                        }),
                        new Button("2x", () => {
                            this.speed(2);
                        })
                    ], "col-9"),
                    new ButtonBar([
                        new Button("< 30s", () => {
                            this.skip(-30);
                        }),
                        new Button("30s >", () => {
                            this.skip(30);
                        })
                    ], "col-3 float-end")
                ]),

                new Div(null, { className: "playerButtonsContainer" }, [
                    this.playButton = new Icon({
                        className: "playerButton fa fa-play fa-3x",
                        style: { display: "none" },
                        onClick: () => {
                            S.quanta.audioPlaying = true;
                            this.player?.play();
                        }
                    }),
                    this.pauseButton = new Icon({
                        className: "playerButton fa fa-pause fa-3x",
                        onClick: () => {
                            S.quanta.audioPlaying = false;
                            this.player?.pause();
                        }
                    })
                ]),
                new Div(null, { className: "row" }, [
                    new ButtonBar([
                        !this.playingMemoryBlob ? new Button("Copy", this.copyToClipboard) : null,
                        !this.playingMemoryBlob && !getAs().isAnonUser ? new Button("Post", this.postComment) : null,
                        new Button("Close", this.destroyPlayer, null, "btn-secondary float-end")
                    ], "col-9 d-flex align-items-end"),
                    !this.playingMemoryBlob ? new Div(null, { className: "col-3 float-end" }, [
                        this.timeLeftTextField = new TextField({
                            label: "Timer (mins.)",
                            inputClass: "timeRemainingEditField",
                            labelLeft: true,
                            val: this.timeLeftState
                        })
                    ]) : null
                ]),
                this.customDiv
            ])
        ];

        this.audioPlayer.onMount((elm: HTMLElement) => {
            this.player = elm as HTMLAudioElement;
            if (!this.player) return;

            this.player.onpause = (_event) => {
                this.updatePlayButton();
            };
            this.player.onplay = (_event) => {
                this.updatePlayButton();
            };
            this.player.onended = (_event) => {
                this.updatePlayButton();
            };
        });

        return children;
    }

    updatePlayButton = () => {
        if (!this.player) return;
        this.updatePlayingState();

        this.playButton.onMount((elm: HTMLElement) => {
            this.updatePlayingState();
            elm.style.display = !S.quanta.audioPlaying ? "inline-block" : "none";
        });

        this.pauseButton.onMount((elm: HTMLElement) => {
            this.updatePlayingState();
            elm.style.display = S.quanta.audioPlaying ? "inline-block" : "none";
        });
    }

    updatePlayingState = () => {
        S.quanta.audioPlaying = !this.player.paused && !this.player.ended;
    }

    cancel(): void {
        S.quanta.audioPlaying = false;
        this.close();
        if (this.player) {
            this.player.pause();
            this.player.remove();
        }
    }

    speed = (rate: number) => {
        if (this.player) {
            this.player.playbackRate = rate;
        }
    }

    skip = (delta: number) => {
        if (this.player) {
            this.player.currentTime += delta;
        }
    }

    destroyPlayer = () => {
        S.quanta.audioPlaying = false;
        if (this.player) {
            this.player.pause();
        }
        this.cancel();
    }

    postComment = () => {
        const link = this.getLink();
        S.edit.addNode(null, J.NodeType.COMMENT, "\n\n" + link, null);
    }

    copyToClipboard = () => {
        const link = this.getLink();
        S.util.copyToClipboard(link);
    }

    getLink = (): string => {
        const port = (location.port !== "80" && location.port !== "443") ? (":" + location.port) : "";
        const link = location.protocol + "//" + location.hostname + port + "?audioUrl=" + this.sourceUrl + "&t=" + Math.trunc(this.player.currentTime);
        return link;
    }

    restoreStartTime = () => {
        /* makes player always start wherever the user last was when they clicked "pause" */
        if (this.player) {
            if (this.startTimePendingOverride > 0) {
                this.player.currentTime = this.startTimePendingOverride;
                this.startTimePendingOverride = null;
                this.startTimePending = null;
            }
            else if (this.startTimePending) {
                this.player.currentTime = this.startTimePending;
                this.startTimePending = null;
            }
        }
    }

    onEnded = () => {
        if (this.player) {
            this.player.currentTime = 0;
            this.savePlayerInfo(this.player.src, 0);
            this.player.pause();
        }
    }

    onTimeUpdate = () => {
        if (!this.saveTimer) {
            /* save time offset into browser local storage every 3 seconds */
            this.saveTimer = setInterval(this.saveTime, 3000);
        }

        this.restoreStartTime();

        if (this.adSegments) {
            for (const seg of this.adSegments) {
                /* endTime of -1 means the rest of the media should be considered ADs */
                if (this.player.currentTime >= seg.beginTime && //
                    (this.player.currentTime <= seg.endTime || seg.endTime < 0)) {

                    /* jump to end of audio if rest is an add, with logic of -3 to ensure we don't
                    go into a loop jumping to end over and over again */
                    if (seg.endTime < 0 && this.player.currentTime < this.player.duration - 3) {
                        /* jump to last to seconds of audio, i'll do this instead of pausing, in
                         case there are is more audio automatically about to play, we don't want to
                         halt it all */
                        this.player.loop = false;
                        this.player.currentTime = this.player.duration - 2;
                    }
                    /* or else we are in a commercial segment so jump to one second past it */
                    else {
                        this.player.currentTime = seg.endTime + 1;
                    }
                    return;
                }
            }
        }
    }

    saveTime = () => {
        if (this.player && !this.player.paused) {
            /* this safety check to be sure no hidden audio can still be playing should no longer be
            needed now that I have the close listener even on the dialog, but i'll leave this here
            anyway. Can't hurt. */
            if (!S.util.isElmVisible(this.player)) {
                this.player.pause();
            }

            this.savePlayerInfo(this.player.src, this.player.currentTime);
        }
    }

    savePlayerInfo = (url: string, timeOffset: number) => {
        const urlHash = S.util.hashOfString(url);
        localStorage[urlHash] = timeOffset;
    }
}
