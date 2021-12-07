import { useState } from "react";

export class State {
    state: any = {};

    // this is 'overridable/assignable' so that we have a way to monitor values as they get assigned
    // or even translate a value to some other value during assignment
    stateTranslator = (s: any): any => {
        return s;
    }

    mergeState<ST>(moreState: ST): any {
        this.setStateEx((state: any) => {
            this.state = { ...state, ...moreState };
            return this.stateTranslator(this.state);
        });
    }

    setState = <ST>(newState: ST): any => {
        this.setStateEx((state: any) => {
            return this.state = this.stateTranslator({ ...newState });
        });
    }

    setStateEx<ST>(state: ST) {
        if (!state) {
            state = {} as ST;
        }
        if (typeof state === "function") {
            this.state = state(this.state);
        }
        else {
            this.state = state;
        }
    }

    useState = () => {
        const [state, setStateEx] = useState(this.state);
        this.state = state;
        this.setStateEx = setStateEx.bind(this);
    }

    updateVisAndEnablement = () => {
        if (this.state.enabled === undefined) {
            this.state.enabled = true;
        }

        if (this.state.visible === undefined) {
            this.state.visible = true;
        }
    }
}
