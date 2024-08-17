
package quanta.rest.response;

import java.util.List;
import quanta.rest.response.base.ResponseBase;

public class GetServerInfoResponse extends ResponseBase {
	private List<InfoMessage> messages;
	
	public List<InfoMessage> getMessages() {
		return this.messages;
	}
	
	public void setMessages(final List<InfoMessage> messages) {
		this.messages = messages;
	}

	public GetServerInfoResponse() {
	}
}
