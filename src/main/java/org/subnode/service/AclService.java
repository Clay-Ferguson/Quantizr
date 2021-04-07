package org.subnode.service;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;
import java.util.StringTokenizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.subnode.exception.base.RuntimeEx;
import org.subnode.model.client.NodeProp;
import org.subnode.model.client.PrincipalName;
import org.subnode.mongo.MongoAuth;
import org.subnode.mongo.MongoRead;
import org.subnode.mongo.MongoSession;
import org.subnode.mongo.MongoUpdate;
import org.subnode.mongo.model.AccessControl;
import org.subnode.mongo.model.MongoPrincipal;
import org.subnode.mongo.model.SubNode;
import org.subnode.request.AddPrivilegeRequest;
import org.subnode.request.GetNodePrivilegesRequest;
import org.subnode.request.RemovePrivilegeRequest;
import org.subnode.request.SetCipherKeyRequest;
import org.subnode.response.AddPrivilegeResponse;
import org.subnode.response.GetNodePrivilegesResponse;
import org.subnode.response.RemovePrivilegeResponse;
import org.subnode.response.SetCipherKeyResponse;
import org.subnode.util.ExUtil;
import org.subnode.util.ThreadLocals;
import org.subnode.util.XString;

/**
 * Service methods for (ACL): processing security, privileges, and Access Control List information
 * on nodes.
 */
@Component
public class AclService {
	private static final Logger log = LoggerFactory.getLogger(AclService.class);

	@Autowired
	private MongoRead read;

	@Autowired
	private MongoUpdate update;

	@Autowired
	private MongoAuth auth;

	@Autowired
	private UserManagerService userManagerService;

	/**
	 * Returns the privileges that exist on the node identified in the request.
	 */
	public GetNodePrivilegesResponse getNodePrivileges(MongoSession session, GetNodePrivilegesRequest req) {
		GetNodePrivilegesResponse res = new GetNodePrivilegesResponse();
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = read.getNode(session, nodeId);

		if (!req.isIncludeAcl() && !req.isIncludeOwners()) {
			throw ExUtil.wrapEx("no specific information requested for getNodePrivileges");
		}

		if (req.isIncludeAcl()) {
			res.setAclEntries(auth.getAclEntries(session, node));
		}

		if (req.isIncludeOwners()) {
			List<String> owners = userManagerService.getOwnerNames(node);
			// log.info("Owner Count: " + owners.size());
			res.setOwners(owners);
		}

		res.setSuccess(true);
		return res;
	}

	/*
	 * Adds or updates a new privilege to a node
	 */
	public AddPrivilegeResponse addPrivilege(MongoSession session, AddPrivilegeRequest req) {
		AddPrivilegeResponse res = new AddPrivilegeResponse();
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = read.getNode(session, nodeId);
		auth.authRequireOwnerOfNode(session, node);

		boolean success = addPrivilege(session, node, req.getPrincipal(), req.getPrivileges(), res);
		res.setSuccess(success);
		return res;
	}

	/*
	 * Adds or updates a new encryption key to a node
	 */
	public SetCipherKeyResponse setCipherKey(MongoSession session, SetCipherKeyRequest req) {
		SetCipherKeyResponse res = new SetCipherKeyResponse();
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = read.getNode(session, nodeId);
		auth.authRequireOwnerOfNode(session, node);

		String cipherKey = node.getStrProp(NodeProp.ENC_KEY.s());
		if (cipherKey == null) {
			throw new RuntimeEx("Attempted to alter keys on a non-encrypted node.");
		}

		boolean success = setCipherKey(session, node, req.getPrincipalNodeId(), req.getCipherKey(), res);
		res.setSuccess(success);
		return res;
	}

	public boolean setCipherKey(MongoSession session, SubNode node, String principalNodeId, String cipherKey,
			SetCipherKeyResponse res) {
		boolean ret = false;

		HashMap<String, AccessControl> acl = node.getAc();
		AccessControl ac = acl.get(principalNodeId);
		if (ac != null) {
			ac.setKey(cipherKey);
			node.setAc(acl);
			update.save(session, node);
			ret = true;
		}
		return ret;
	}

	public boolean addPrivilege(MongoSession session, SubNode node, String principal, List<String> privileges,
			AddPrivilegeResponse res) {

		if (principal == null)
			return false;

		String cipherKey = node.getStrProp(NodeProp.ENC_KEY.s());
		String mapKey = null;

		SubNode principalNode = null;
		/* If we are sharing to public, then that's the map key */
		if (principal.equalsIgnoreCase(PrincipalName.PUBLIC.s())) {
			if (cipherKey != null) {
				throw new RuntimeEx("Cannot make an encrypted node public.");
			}
			mapKey = PrincipalName.PUBLIC.s();
		}
		/*
		 * otherwise we're sharing to a person so we now get their userNodeId to use as map key
		 */
		else {
			principalNode = read.getUserNodeByUserName(auth.getAdminSession(), principal);
			if (principalNode == null) {
				if (res != null) {
					res.setMessage("Unknown user name: " + principal);
					res.setSuccess(false);
				}
				return false;
			}
			mapKey = principalNode.getId().toHexString();

			/*
			 * If this node is encrypted we get the public key of the user being shared with to send back to the
			 * client, which will then use it to encrypt the symmetric key to the data, and then send back up to
			 * the server to store in this sharing entry
			 */
			if (cipherKey != null) {
				String principalPubKey = principalNode.getStrProp(NodeProp.USER_PREF_PUBLIC_KEY.s());
				if (principalPubKey == null) {
					if (res != null) {
						res.setMessage("User doesn't have a PublicKey available: " + principal);
						res.setSuccess(false);
						return false;
					}
				}
				log.debug("principalPublicKey: " + principalPubKey);

				if (res != null) {
					res.setPrincipalPublicKey(principalPubKey);
					res.setPrincipalNodeId(mapKey);
				}
			}
		}

		HashMap<String, AccessControl> acl = node.getAc();

		/* initialize acl to a map if it's null */
		if (acl == null) {
			acl = new HashMap<>();
		}

		/*
		 * Get access control entry from map, but if one is not found, we can just create one.
		 */
		AccessControl ac = acl.get(mapKey);
		if (ac == null) {
			ac = new AccessControl();
		}

		String prvs = ac.getPrvs();
		if (prvs == null) {
			prvs = "";
		}

		boolean authAdded = false;

		/* Scan all the privileges to be added to this principal (rd, rw, etc) */
		for (String priv : privileges) {

			/* If this privilege is not already on ac.prvs string then append it */
			if (prvs.indexOf(priv) == -1) {
				authAdded = true;
				if (prvs.length() > 0) {
					prvs += ",";
				}
				prvs += priv;
			}
		}

		if (authAdded) {
			ac.setPrvs(prvs);
			acl.put(mapKey, ac);
			node.setAc(acl);
			update.save(session, node);
		}

		return true;
	}

	public void removeAclEntry(MongoSession session, SubNode node, String principalNodeId, String privToRemove) {
		HashSet<String> setToRemove = XString.tokenizeToSet(privToRemove, ",", true);

		HashMap<String, AccessControl> acl = node.getAc();
		if (acl == null)
			return;

		AccessControl ac = acl.get(principalNodeId);
		String privs = ac.getPrvs();
		if (privs == null) {
			log.debug("ACL didn't contain principalNodeId " + principalNodeId + "\nACL DUMP: " + XString.prettyPrint(acl));
			return;
		}
		StringTokenizer t = new StringTokenizer(privs, ",", false);
		String newPrivs = "";
		boolean removed = false;

		/*
		 * build the new comma-delimited privs list by adding all that aren't in the 'setToRemove
		 */
		while (t.hasMoreTokens()) {
			String tok = t.nextToken().trim();
			if (setToRemove.contains(tok)) {
				removed = true;
				continue;
			}
			if (newPrivs.length() > 0) {
				newPrivs += ",";
			}
			newPrivs += tok;
		}

		if (removed) {
			/*
			 * If there are no privileges left for this principal, then remove the principal entry completely
			 * from the ACL. We don't store empty ones.
			 */
			if (newPrivs.equals("")) {
				acl.remove(principalNodeId);
			} else {
				ac.setPrvs(newPrivs);
				acl.put(principalNodeId, ac);
			}

			/*
			 * if there are now no acls at all left set the ACL to null, so it is completely removed from the
			 * node
			 */
			if (acl.isEmpty()) {
				node.setAc(null);
			} else {
				node.setAc(acl);
			}

			update.save(session, node);
		}
	}

	/*
	 * Removes the privilege specified in the request from the node specified in the request
	 */
	public RemovePrivilegeResponse removePrivilege(MongoSession session, RemovePrivilegeRequest req) {
		RemovePrivilegeResponse res = new RemovePrivilegeResponse();
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}

		String nodeId = req.getNodeId();
		SubNode node = read.getNode(session, nodeId);
		auth.authRequireOwnerOfNode(session, node);

		String principalNodeId = req.getPrincipalNodeId();
		String privilege = req.getPrivilege();

		removeAclEntry(session, node, principalNodeId, privilege);
		res.setSuccess(true);
		return res;
	}

	public List<String> getOwnerNames(MongoSession session, SubNode node) {
		Set<String> ownerSet = new HashSet<>();
		/*
		 * We walk up the tree util we get to the root, or find ownership on node, or any of it's parents
		 */

		int sanityCheck = 0;
		while (++sanityCheck < 100) {
			List<MongoPrincipal> principals = getNodePrincipals(session, node);
			for (MongoPrincipal p : principals) {

				/*
				 * todo-3: this is a spot that can be optimized. We should be able to send just the userNodeId back
				 * to client, and the client should be able to deal with that (i think). depends on how much
				 * ownership info we need to show user. ownerSet.add(p.getUserNodeId());
				 */
				SubNode userNode = read.getNode(session, p.getUserNodeId());
				String userName = userNode.getStrProp(NodeProp.USER.s());
				ownerSet.add(userName);
			}

			if (principals.size() == 0) {
				node = read.getParent(session, node);
				if (node == null)
					break;
			} else {
				break;
			}
		}

		List<String> ownerList = new LinkedList<>(ownerSet);
		Collections.sort(ownerList);
		return ownerList;
	}

	public static List<MongoPrincipal> getNodePrincipals(MongoSession session, SubNode node) {
		List<MongoPrincipal> principals = new LinkedList<>();
		MongoPrincipal principal = new MongoPrincipal();
		principal.setUserNodeId(node.getId());
		principal.setAccessLevel("w");
		principals.add(principal);
		return principals;
	}

	public static boolean isPublic(MongoSession session, SubNode node) {
		return node.getAc() != null && node.getAc().containsKey(PrincipalName.PUBLIC.s());
	}
}
