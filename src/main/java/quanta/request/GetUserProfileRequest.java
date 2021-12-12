package quanta.request;

import quanta.request.base.RequestBase;

public class GetUserProfileRequest extends RequestBase {
    public String userId;

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }
}
