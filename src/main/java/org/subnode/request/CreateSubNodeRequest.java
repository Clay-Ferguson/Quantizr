package org.subnode.request;

import java.util.List;

import org.subnode.model.PropertyInfo;
import org.subnode.request.base.RequestBase;

public class CreateSubNodeRequest extends RequestBase {
	
	private String nodeId;

	//todo-1: is there a JSON annotaiton to make this optional on TS object
	private String content; //optional, default content
	
	private String newNodeName;
	private String typeName;
	private boolean createAtTop;

	/* Adds TYPE_LOCK property which prevents user from being able to change the type on the node */
	private boolean typeLock;

	//default properties to add, or null if none
	private List<PropertyInfo> properties;

	private boolean updateModTime;

	public String getNodeId() {
		return nodeId;
	}

	public void setNodeId(String nodeId) {
		this.nodeId = nodeId;
	}

	public String getNewNodeName() {
		return newNodeName;
	}

	public void setNewNodeName(String newNodeName) {
		this.newNodeName = newNodeName;
	}

	public String getTypeName() {
		return typeName;
	}

	public void setTypeName(String typeName) {
		this.typeName = typeName;
	}

	public String getContent() {
		return content;
	}

	public void setContent(String content) {
		this.content = content;
	}

	public boolean isCreateAtTop() {
		return createAtTop;
	}

	public void setCreateAtTop(boolean createAtTop) {
		this.createAtTop = createAtTop;
	}

	public boolean isTypeLock() {
		return typeLock;
	}

	public void setTypeLock(boolean typeLock) {
		this.typeLock = typeLock;
	}

	public List<PropertyInfo> getProperties() {
		return properties;
	}

	public void setProperties(List<PropertyInfo> properties) {
		this.properties = properties;
	}

	public boolean isUpdateModTime() {
		return updateModTime;
	}

	public void setUpdateModTime(boolean updateModTime) {
		this.updateModTime = updateModTime;
	}
}
