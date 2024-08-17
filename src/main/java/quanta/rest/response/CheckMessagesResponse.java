
package quanta.rest.response;

import quanta.rest.response.base.ResponseBase;

public class CheckMessagesResponse extends ResponseBase {
    private int numNew;
    
    public int getNumNew() {
        return this.numNew;
    }
    
    public void setNumNew(final int numNew) {
        this.numNew = numNew;
    }
    
    public CheckMessagesResponse() {
    }
}
