package org.subnode.model.client;

public enum PrivilegeType {
	/* Can read the node and entire subgraph of nodes it contains */
	READ("rd"), //

	/* Can read and write this node. Write to subnodes is not granted by this.

	todo-0: check all code and make sure this isn't used where 'owner requirement' is meant.
	*/
	WRITE("wr"); //

	public final String name;

	private PrivilegeType(String name) {
		this.name = name;
	}

	public String toString() {
		return name;
	}

	public String s() {
		return name;
	}
}
