
package quanta.rest.request;

import quanta.rest.request.base.RequestBase;

public class DeleteFriendRequest extends RequestBase {
	private String userNodeId;
	
	public String getUserNodeId() {
		return this.userNodeId;
	}
	
	public void setUserNodeId(final String userNodeId) {
		this.userNodeId = userNodeId;
	}

	public DeleteFriendRequest() {
	}
}
