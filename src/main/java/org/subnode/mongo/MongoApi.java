package org.subnode.mongo;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.StringTokenizer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.subnode.config.AppProp;
import org.subnode.config.NodeName;
import org.subnode.config.SessionContext;
import org.subnode.exception.NodeAuthFailedException;
import org.subnode.exception.base.RuntimeEx;
import org.subnode.model.client.PrincipalName;
import org.subnode.model.client.NodeProp;
import org.subnode.model.client.NodeType;
import org.subnode.image.ImageSize;
import org.subnode.image.ImageUtil;
import org.subnode.model.AccessControlInfo;
import org.subnode.model.PrivilegeInfo;
import org.subnode.model.PropertyInfo;
import org.subnode.mongo.model.AccessControl;
import org.subnode.model.client.PrivilegeType;
import org.subnode.mongo.model.SubNode;
import org.subnode.service.AttachmentService;
import org.subnode.service.UserFeedService;
import org.subnode.util.Const;
import org.subnode.util.Convert;
import org.subnode.util.ExUtil;
import org.subnode.util.SubNodeUtil;
import org.subnode.util.Util;
import org.subnode.util.ValContainer;
import org.subnode.util.XString;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoCursor;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.result.DeleteResult;

import org.apache.commons.lang3.StringUtils;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Sort.Direction;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.IndexField;
import org.springframework.data.mongodb.core.index.IndexInfo;
import org.springframework.data.mongodb.core.index.TextIndexDefinition;
import org.springframework.data.mongodb.core.index.TextIndexDefinition.TextIndexDefinitionBuilder;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.TextCriteria;
import org.springframework.stereotype.Component;

/**
 * NOTE: regex test site: http://reg-exp.com/
 */
@Component
public class MongoApi {
	private static final Logger log = LoggerFactory.getLogger(MongoApi.class);

	@Autowired
	private MongoAppConfig mac;

	@Autowired
	private MongoTemplate ops;

	@Autowired
	private SubNodeUtil apiUtil;

	@Autowired
	private AclService aclService;

	@Autowired
	private AppProp appProp;

	@Autowired
	private SessionContext sessionContext;

	@Autowired
	private AttachmentService attachmentService;

	@Autowired
	private UserFeedService userFeedService;

	public static SubNode systemRootNode;

	private static final MongoSession adminSession = MongoSession.createFromUser(PrincipalName.ADMIN.s());
	private static final MongoSession anonSession = MongoSession.createFromUser(PrincipalName.ANON.s());

	public MongoSession getAdminSession() {
		return adminSession;
	}

	public MongoSession getAnonSession() {
		return anonSession;
	}

	public boolean isAllowedUserName(String userName) {
		userName = userName.trim();
		return !userName.equalsIgnoreCase(PrincipalName.ADMIN.s()) && //
				!userName.equalsIgnoreCase(PrincipalName.PUBLIC.s()) && //
				!userName.equalsIgnoreCase(PrincipalName.ANON.s());
	}

	public void authRequireOwnerOfNode(MongoSession session, SubNode node) {
		if (node == null) {
			throw new RuntimeEx("Auth Failed. Node did not exist.");
		}
		if (!session.isAdmin() && !session.getUserNode().getId().equals(node.getOwner())) {
			throw new RuntimeEx("Auth Failed. Node ownership required.");
		}
	}

	public void requireAdmin(MongoSession session) {
		if (!session.isAdmin())
			throw new RuntimeEx("auth fail");
	}

	public void auth(MongoSession session, SubNode node, PrivilegeType... privs) {
		auth(session, node, Arrays.asList(privs));
	}

	/*
	 * The way know a node is an account node is that it is its id matches its'
	 * owner. Self owned node. This is because the very definition of the 'owner' on
	 * any given node is the ID of the user's root node of the user who owns it
	 */
	public boolean isAnAccountNode(MongoSession session, SubNode node) {
		return node.getId().toHexString().equals(node.getOwner().toHexString());
	}

	/* Returns true if this user on this session has privType access to 'node' */
	public void auth(MongoSession session, SubNode node, List<PrivilegeType> priv) {
		if (priv == null || priv.size() == 0) {
			throw new RuntimeEx("privileges not specified.");
		}

		// admin has full power over all nodes
		if (node == null || session.isAdmin()) {
			log.trace("auth granted. you're admin.");
			return;
		}

		// log.trace("auth: id=" + node.getId().toHexString() + " Priv: " +
		// XString.prettyPrint(priv));

		if (node.getOwner() == null) {
			log.trace("auth fails. node had no owner: " + node.getPath());
			throw new RuntimeEx("node had no owner: " + node.getPath());
		}

		// if this session user is the owner of this node, then they have full power
		if (!session.isAnon() && session.getUserNode().getId().equals(node.getOwner())) {
			log.trace("allow bc user owns node. accountId: " + node.getOwner().toHexString());
			return;
		}

		// Find any ancestor that has priv shared to this user.
		if (ancestorAuth(session, node, priv)) {
			log.trace("ancestor auth success.");
			return;
		}

		log.trace("    Unauthorized attempt at node id=" + node.getId() + " path=" + node.getPath());
		throw new NodeAuthFailedException();
	}

	/*
	 * NOTE: this should ONLY ever be called from 'auth()' method of this class
	 * 
	 * todo-1: MongoThreadLocal class has a variable created to memoize these
	 * results per-request but that has not yet been implemented.
	 */
	private boolean ancestorAuth(MongoSession session, SubNode node, List<PrivilegeType> privs) {

		/* get the non-null sessionUserNodeId if not anonymous user */
		String sessionUserNodeId = session.isAnon() ? null : session.getUserNode().getId().toHexString();

		String path = node.getPath();
		log.trace("ancestorAuth: path=" + path);

		StringBuilder fullPath = new StringBuilder();
		StringTokenizer t = new StringTokenizer(path, "/", false);
		boolean ret = false;
		while (t.hasMoreTokens()) {
			String pathPart = t.nextToken().trim();
			fullPath.append("/");
			fullPath.append(pathPart);

			// todo-2: remove concats and let NodeName have static finals for these full
			// paths.
			if (pathPart.equals("/" + NodeName.ROOT))
				continue;
			if (pathPart.equals(NodeName.ROOT_OF_ALL_USERS))
				continue;

			// I'm putting the caching of ACL results on hold, because this is only a
			// performance
			// enhancement and can wait.
			// Boolean knownAuthResult =
			// MongoThreadLocal.aclResults().get(buildAclThreadLocalKey(sessionUserNodeId,
			// fullPath,
			// privs));

			SubNode tryNode = getNode(session, fullPath.toString(), false);
			if (tryNode == null) {
				throw new RuntimeEx("Tree corrupt! path not found: " + fullPath.toString());
			}

			// if this session user is the owner of this node, then they have full power
			if (!session.isAnon() && session.getUserNode().getId().equals(tryNode.getOwner())) {
				ret = true;
				break;
			}

			if (nodeAuth(tryNode, sessionUserNodeId, privs)) {
				ret = true;
				break;
			}
		}

		return ret;
	}

	/*
	 * NOTE: It is the normal flow that we expect sessionUserNodeId to be null for
	 * any anonymous requests and this is fine because we are basically going to
	 * only be pulling 'public' acl to check, and this is by design.
	 */
	public boolean nodeAuth(SubNode node, String sessionUserNodeId, List<PrivilegeType> privs) {
		HashMap<String, AccessControl> acl = node.getAc();
		if (acl == null)
			return false;
		String allPrivs = "";

		AccessControl ac = (sessionUserNodeId == null ? null : acl.get(sessionUserNodeId));
		String privsForUserId = ac != null ? ac.getPrvs() : null;
		if (privsForUserId != null) {
			allPrivs += privsForUserId;
		}

		/*
		 * We always add on any privileges assigned to the PUBLIC when checking privs
		 * for this user, becasue the auth equivalent is really the union of this set.
		 */
		AccessControl acPublic = acl.get(PrincipalName.PUBLIC.s());
		String privsForPublic = acPublic != null ? acPublic.getPrvs() : null;
		if (privsForPublic != null) {
			if (allPrivs.length() > 0) {
				allPrivs += ",";
			}
			allPrivs += privsForPublic;
		}

		if (allPrivs.length() > 0) {
			for (PrivilegeType priv : privs) {
				if (allPrivs.indexOf(priv.name) == -1) {
					/* if any priv is missing we fail the auth */
					return false;
				}
			}
			/* if we looped thru all privs ok, auth is successful */
			return true;
		}
		return false;
	}

	public void save(MongoSession session, SubNode node) {
		save(session, node, true);
	}

	public void save(MongoSession session, SubNode node, boolean allowAuth) {
		if (allowAuth) {
			auth(session, node, PrivilegeType.WRITE);
		}
		// log.debug("MongoApi.save: DATA: " + XString.prettyPrint(node));
		ops.save(node);
		MongoThreadLocal.clean(node);
	}

	/**
	 * Gets account name from the root node associated with whoever owns 'node'
	 */
	public String getNodeOwner(MongoSession session, SubNode node) {
		if (node.getOwner() == null) {
			throw new RuntimeEx("Node has null owner: " + XString.prettyPrint(node));
		}
		SubNode userNode = getNode(session, node.getOwner());
		return userNode.getStringProp(NodeProp.USER.s());
	}

	public void deleteNode(MongoSession session, SubNode node) {
		attachmentService.deleteBinary(session, node);
		delete(session, node);
	}

	// todo-1: need to look into bulk-ops for doing this saveSession updating
	// tips:
	// https://stackoverflow.com/questions/26657055/spring-data-mongodb-and-bulk-update
	// BulkOperations ops = template.bulkOps(BulkMode.UNORDERED, Match.class);
	// for (User user : users) {
	// Update update = new Update();
	// ...
	// ops.updateOne(query(where("id").is(user.getId())), update);
	// }
	// ops.execute();
	//
	/*
	 * Actually this is probably already solved in some sort of BATCHING API already
	 * written.
	 */
	public void saveSession(MongoSession session) {
		if (session == null || session.saving || !MongoThreadLocal.hasDirtyNodes())
			return;

		try {
			// we check the saving flag to ensure we don't go into circular recursion here.
			session.saving = true;

			synchronized (session) {
				if (!MongoThreadLocal.hasDirtyNodes()) {
					return;
				}

				/*
				 * We use 'nodes' list to avoid a concurrent modification excption in the loop
				 * below that deletes nodes, because each time we delete a node we remove it
				 * from the 'dirtyNodes' on the threadlocals
				 */
				List<SubNode> nodes = new LinkedList<SubNode>();

				/*
				 * check that we are allowed to write all, before we start writing any
				 */
				for (SubNode node : MongoThreadLocal.getDirtyNodes().values()) {
					auth(session, node, PrivilegeType.WRITE);
					nodes.add(node);
				}

				for (SubNode node : nodes) {
					//log.debug("saveSession: Saving Dirty. nodeId=" + node.getId().toHexString());
					save(session, node, false);
				}
			}
		} finally {
			session.saving = false;
		}
	}

	public SubNode createNode(MongoSession session, SubNode parent, String type, Long ordinal,
			CreateNodeLocation location) {
		return createNode(session, parent, null, type, ordinal, location, null);
	}

	public SubNode createNode(MongoSession session, String path) {
		ObjectId ownerId = getOwnerNodeIdFromSession(session);
		SubNode node = new SubNode(ownerId, path, NodeType.NONE.s(), null);
		return node;
	}

	public SubNode createNode(MongoSession session, String path, String type, String ownerName) {
		if (type == null) {
			type = NodeType.NONE.s();
		}
		ObjectId ownerId = getOwnerNodeIdFromSession(session);
		SubNode node = new SubNode(ownerId, path, type, null);
		return node;
	}

	public SubNode createNode(MongoSession session, String path, String type) {
		if (type == null) {
			type = NodeType.NONE.s();
		}
		ObjectId ownerId = getOwnerNodeIdFromSession(session);
		SubNode node = new SubNode(ownerId, path, type, null);
		return node;
	}

	/*
	 * Creates a node, but does NOT persist it. If parent==null it assumes it's
	 * adding a root node. This is required, because all the nodes at the root level
	 * have no parent. That is, there is no ROOT node. Only nodes considered to be
	 * on the root.
	 * 
	 * relPath can be null if no path is known
	 */
	public SubNode createNode(MongoSession session, SubNode parent, String relPath, String type, Long ordinal,
			CreateNodeLocation location, List<PropertyInfo> properties) {
		if (relPath == null) {
			/*
			 * Adding a node ending in '?' will trigger for the system to generate a leaf
			 * node automatically.
			 */
			relPath = "?";
		}

		if (type == null) {
			type = NodeType.NONE.s();
		}

		String path = (parent == null ? "" : parent.getPath()) + "/" + relPath;

		ObjectId ownerId = getOwnerNodeIdFromSession(session);

		// for now not worried about ordinals for root nodes.
		if (parent == null) {
			ordinal = 0L;
		} else {
			ordinal = prepOrdinalForLocation(session, location, parent, ordinal);
		}

		SubNode node = new SubNode(ownerId, path, type, ordinal);

		if (properties != null) {
			for (PropertyInfo propInfo : properties) {
				node.setProp(propInfo.getName(), propInfo.getValue());
			}
		}

		return node;
	}

	private Long prepOrdinalForLocation(MongoSession session, CreateNodeLocation location, SubNode parent,
			Long ordinal) {
		switch (location) {
			case FIRST:
				ordinal = 0L;
				insertOrdinal(session, parent, 0L, 1L);
				saveSession(session);
				break;
			case LAST:
				ordinal = getMaxChildOrdinal(session, parent) + 1;
				parent.setMaxChildOrdinal(ordinal);
				break;
			case ORDINAL:
				insertOrdinal(session, parent, ordinal, 1L);
				saveSession(session);
				// leave ordinal same and return it.
				break;
		}

		return ordinal;
	}

	/*
	 * Shifts all child ordinals down (increments them by rangeSize), that are >=
	 * 'ordinal' to make a slot for the new ordinal positions for some new nodes to
	 * be inserted into this newly available range of unused sequential ordinal
	 * values (range of 'ordinal+1' thru 'ordinal+1+rangeSize')
	 */
	public void insertOrdinal(MongoSession session, SubNode node, long ordinal, long rangeSize) {
		long maxOrdinal = 0;

		/*
		 * todo-1: verify this is correct with getChildren querying unordered. It's
		 * probably fine, but also can we do a query here that selects only the
		 * ">= ordinal" ones to make this do the minimal size query?
		 */
		for (SubNode child : getChildren(session, node, null, null)) {
			Long childOrdinal = child.getOrdinal();
			long childOrdinalInt = childOrdinal == null ? 0L : childOrdinal.longValue();

			if (childOrdinalInt >= ordinal) {
				childOrdinalInt += rangeSize;
				child.setOrdinal(childOrdinalInt);
			}

			if (childOrdinalInt > maxOrdinal) {
				maxOrdinal = childOrdinalInt;
			}
		}

		/*
		 * even in the boundary case where there were no existing children, it's ok to
		 * set this node value to zero here
		 */
		node.setMaxChildOrdinal(maxOrdinal);
	}

	public ObjectId getOwnerNodeIdFromSession(MongoSession session) {
		ObjectId ownerId = null;

		if (session.getUserNode() != null) {
			ownerId = session.getUserNode().getOwner();
		} else {
			SubNode ownerNode = getUserNodeByUserName(adminSession, session.getUser());
			if (ownerNode == null) {
				/*
				 * slight mod to help bootstrapping when the admin doesn't initially have an
				 * ownernode until created
				 */
				if (!session.isAdmin()) {
					throw new RuntimeEx("No user node found for user: " + session.getUser());
				} else
					return null;
			} else {
				ownerId = ownerNode.getOwner();
			}
		}

		if (ownerId == null) {
			throw new RuntimeEx("Unable to get ownerId from the session.");
		}

		// if we return null, it indicates the owner is Admin.
		return ownerId;
	}

	public String getParentPath(SubNode node) {
		return XString.truncateAfterLast(node.getPath(), "/");
	}

	public long getChildCount(MongoSession session, SubNode node) {
		// log.debug("MongoApi.getChildCount");

		Query query = new Query();
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getPath()));
		query.addCriteria(criteria);
		saveSession(session);
		return ops.count(query, SubNode.class);
	}

	/*
	 * I find it odd that MongoTemplate no count for the whole collection. A query
	 * is always required? Strange oversight on their part.
	 */
	public long getNodeCount(MongoSession session) {
		Query query = new Query();
		// Criteria criteria =
		// Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getPath()));
		// query.addCriteria(criteria);
		saveSession(session);
		return ops.count(query, SubNode.class);
	}

	public SubNode getChildAt(MongoSession session, SubNode node, long idx) {
		auth(session, node, PrivilegeType.READ);
		Query query = new Query();
		Criteria criteria = Criteria.where(//
				SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getPath()))//
				.and(SubNode.FIELD_ORDINAL).is(idx);
		query.addCriteria(criteria);
		saveSession(session);
		SubNode ret = ops.findOne(query, SubNode.class);
		return ret;
	}

	public void checkParentExists(MongoSession session, SubNode node) {
		boolean isRootPath = isRootPath(node.getPath());
		if (node.isDisableParentCheck() || isRootPath)
			return;

		String parentPath = getParentPath(node);
		if (parentPath == null || parentPath.equals("") || parentPath.equals("/"))
			return;

		// log.debug("Verifying parent path exists: " + parentPath);
		Query query = new Query();
		query.addCriteria(Criteria.where(SubNode.FIELD_PATH).is(parentPath));

		saveSession(session);
		if (!ops.exists(query, SubNode.class)) {
			throw new RuntimeEx("Attempted to add a node before its parent exists:" + parentPath);
		}
	}

	/* Root path will start with '/' and then contain no other slashes */
	public boolean isRootPath(String path) {
		return path.startsWith("/") && path.substring(1).indexOf("/") == -1;
	}

	/**
	 * 2: cleaning up GridFS will be done as an async thread. For now we can just
	 * let GridFS binaries data get orphaned... BUT I think it might end up being
	 * super efficient if we have the 'path' stored in the GridFS metadata so we can
	 * use a 'regex' query to delete all the binaries which is exacly like the one
	 * below for deleting the nodes themselves.
	 * 
	 */
	public void delete(MongoSession session, SubNode node) {
		authRequireOwnerOfNode(session, node);

		log.debug("Deleting under path: " + node.getPath());

		/*
		 * we save the session to be sure there's no conflicting between what cached
		 * changes might be flagged as dirty that might be about to be deleted.
		 * 
		 * todo-1: potential optimization: just clear from the cache any nodes that have
		 * a path starting with 'node.getPath()', and leave the rest in teh cache. But
		 * this will be rare that it has any performance impact.
		 */
		saveSession(session);
		/*
		 * First delete all the children of the node by using the path, knowing all
		 * their paths 'start with' (as substring) this path. Note how efficient it is
		 * that we can delete an entire subgraph in one single operation! Nice!
		 */
		Query query = new Query();
		query.addCriteria(Criteria.where(SubNode.FIELD_PATH).regex(regexRecursiveChildrenOfPath(node.getPath())));

		DeleteResult res = ops.remove(query, SubNode.class);
		log.debug("Num of SubGraph deleted: " + res.getDeletedCount());

		/*
		 * Yes we DO have to remove the node itself separate from the remove of all it's
		 * subgraph, because in order to be perfectly safe the recursive subgraph regex
		 * MUST designate the slash AFTER the root path to be sure we get the correct
		 * node, other wise deleting /ab would also delete /abc for example. so we must
		 * have our recursive delete identify deleting "/ab" as starting with "/ab/"
		 */

		ops.remove(node);
	}

	public Iterable<SubNode> findAllNodes(MongoSession session) {
		requireAdmin(session);
		saveSession(session);
		return ops.findAll(SubNode.class);
	}

	public void convertDb(MongoSession session) {
		// log.debug("convertDb() executing.");
	}

	public String getHashOfPassword(String password) {
		return Util.getHashOfString(password, 20);
	}

	public String getNodeReport() {
		int numDocs = 0;
		int totalJsonBytes = 0;
		MongoDatabase database = mac.mongoClient().getDatabase(MongoAppConfig.databaseName);
		MongoCollection<Document> col = database.getCollection("nodes");

		MongoCursor<Document> cur = col.find().iterator();
		try {
			while (cur.hasNext()) {
				Document doc = cur.next();
				totalJsonBytes += doc.toJson().length();
				numDocs++;
			}
		} catch (Exception ex) {
			throw ExUtil.wrapEx(ex);
		}

		// todo-1: I have a 'formatMemory' written in javascript, and need to do same
		// here or see if there's an apachie string function for it.
		float kb = totalJsonBytes / 1024f;
		return "Node Count: " + numDocs + "<br>Total JSON Size: " + kb + " KB";
	}

	/*
	 * Whenever we do something like reindex in a new way, we might need to
	 * reprocess every object, to generate any kind of auto-generated fields that
	 * need to be there before indexes build we call this.
	 * 
	 * For example when the path hash was introduced (i.e. SubNode.FIELD_PATH_HASH)
	 * we ran this to create all the path hashes so that a unique index could be
	 * built, because the uniqueness test would fail until we generated all the
	 * proper data, which required a modification on every node in the entire DB.
	 * 
	 * Note that MongoEventListener#onBeforeSave does execute even if all we are
	 * doing is reading nodes and then resaving them.
	 */
	// ********* DO NOT DELETE *********
	// (this is needed from time to time)
	public void reSaveAll(MongoSession session) {
		log.debug("Processing reSaveAll: Beginning Node Report: " + getNodeReport());

		// processAllNodes(session);
	}

	public void processAllNodes(MongoSession session) {
		// ValContainer<Long> nodesProcessed = new ValContainer<Long>(0L);

		// Query query = new Query();
		// Criteria criteria = Criteria.where(SubNode.FIELD_ACL).ne(null);
		// query.addCriteria(criteria);

		// saveSession(session);
		// Iterable<SubNode> iter = ops.find(query, SubNode.class);

		// iter.forEach((node) -> {
		// nodesProcessed.setVal(nodesProcessed.getVal() + 1);
		// if (nodesProcessed.getVal() % 1000 == 0) {
		// log.debug("reSave count: " + nodesProcessed.getVal());
		// }

		// // /*
		// // * NOTE: MongoEventListener#onBeforeSave runs in here, which is where some
		// of
		// // * the workload is done that pertains ot this reSave process
		// // */
		// save(session, node, true, false);
		// });
	}

	/* Returns true if there were actually some encryption keys removed */
	public boolean removeAllEncryptionKeys(SubNode node) {
		HashMap<String, AccessControl> aclMap = node.getAc();
		if (aclMap == null) {
			return false;
		}

		ValContainer<Boolean> keysRemoved = new ValContainer<Boolean>(false);
		aclMap.forEach((String key, AccessControl ac) -> {
			if (ac.getKey() != null) {
				ac.setKey(null);
				keysRemoved.setVal(true);
			}
		});

		return keysRemoved.getVal();
	}

	public List<AccessControlInfo> getAclEntries(MongoSession session, SubNode node) {
		HashMap<String, AccessControl> aclMap = node.getAc();
		if (aclMap == null) {
			return null;
		}

		// I'd like this to not be created unless needed but that pesky lambda below
		// needs a 'final' thing to work with.
		List<AccessControlInfo> ret = new LinkedList<AccessControlInfo>();

		aclMap.forEach((k, v) -> {
			AccessControlInfo acei = createAccessControlInfo(session, k, v.getPrvs());
			if (acei != null) {
				ret.add(acei);
			}
		});

		return ret.size() == 0 ? null : ret;
	}

	public AccessControlInfo createAccessControlInfo(MongoSession session, String principalId, String authType) {
		String principalName = null;
		String publicKey = null;

		/* If this is a share to public we don't need to lookup a user name */
		if (principalId.equalsIgnoreCase(PrincipalName.PUBLIC.s())) {
			principalName = PrincipalName.PUBLIC.s();
		}
		/* else we need the user name */
		else {
			SubNode principalNode = getNode(session, principalId, false);
			if (principalNode == null) {
				return null;
			}
			principalName = principalNode.getStringProp(NodeProp.USER.s());
			publicKey = principalNode.getStringProp(NodeProp.USER_PREF_PUBLIC_KEY.s());
		}

		AccessControlInfo info = new AccessControlInfo(principalName, principalId, publicKey);
		info.addPrivilege(new PrivilegeInfo(authType));
		return info;
	}

	public SubNode getNodeByName(MongoSession session, String name) {
		return getNodeByName(session, name, true);
	}

	/*
	 * The name can have either of two different formats: 1) "globalName" (admin
	 * owned node) 2) "userName:nodeName" (a named node some user has created)
	 * 
	 * NOTE: It's a bit confusing but also either 1 or 2 above will be prefixed with
	 * ":" before send into this method and this 'name', but any leading colon is
	 * stripped before it's passed into this method.
	 */
	public SubNode getNodeByName(MongoSession session, String name, boolean allowAuth) {
		Query query = new Query();

		// log.debug("getNodeByName: " + name);

		ObjectId nodeOwnerId;
		int colonIdx = -1;
		if ((colonIdx = name.indexOf(":")) == -1) {
			nodeOwnerId = systemRootNode.getOwner();
			// log.debug("no leading colon, so this is expected to have admin owner=" +
			// nodeOwnerId.toHexString());
		} else {
			String userName = name.substring(0, colonIdx);

			// pass a null session here to cause adminSession to be used which is required
			// to get a user node, but
			// it always safe to get this node this way here.
			SubNode userNode = getUserNodeByUserName(null, userName);
			nodeOwnerId = userNode.getOwner();
			name = name.substring(colonIdx + 1);
		}

		query.addCriteria(Criteria.where(SubNode.FIELD_NAME).is(name)//
				.and(SubNode.FIELD_OWNER).is(nodeOwnerId));
		saveSession(session);
		SubNode ret = ops.findOne(query, SubNode.class);

		// if (ret != null) {
		// log.debug("Node found: id=" + ret.getId().toHexString());
		// }

		if (allowAuth) {
			auth(session, ret, PrivilegeType.READ);
		}
		return ret;
	}

	public SubNode getNode(MongoSession session, String path) {
		return getNode(session, path, true);
	}

	/**
	 * Gets a node using any of the 5 naming types:
	 * 
	 * <pre>
	 * 1) ID (hex string, no special prefix)
	 * 2) path (starts with slash), 
	 * 3) global name (name of admin owned node, starts with colon, and only contains one colon)
	 * 4) name of user owned node fomratted as (":userName:nodeName")
	 * 5) special named location, like '~sn:inbox' (starts with tilde)
	 *    (we support just '~inbox' also as a type shorthand where the sn: is missing)
	 * </pre>
	 */
	public SubNode getNode(MongoSession session, String identifier, boolean allowAuth) {
		if (identifier.equals("/")) {
			throw new RuntimeEx(
					"SubNode doesn't implement the root node. Root is implicit and never needs an actual node to represent it.");
		}

		SubNode ret = null;

		// inbox, friend_list, and user_feed need to be passed as type instead, prefixed
		// with tilde.
		if (identifier.startsWith("~")) {
			String typeName = identifier.substring(1);
			if (!typeName.startsWith("sn:")) {
				typeName = "sn:" + typeName;
			}
			ret = getUserNodeByType(session, session.getUser(), null, null, typeName);
		}
		// Node name lookups are done by prefixing the search with a colon (:)
		else if (identifier.startsWith(":")) {
			ret = getNodeByName(session, identifier.substring(1), allowAuth);
		}
		// If search doesn't start with a slash then it's a nodeId and not a path
		else if (!identifier.startsWith("/")) {
			ret = getNode(session, new ObjectId(identifier), allowAuth);
		} else {
			identifier = XString.stripIfEndsWith(identifier, "/");
			Query query = new Query();
			query.addCriteria(Criteria.where(SubNode.FIELD_PATH).is(identifier));
			saveSession(session);
			ret = ops.findOne(query, SubNode.class);
		}

		if (allowAuth) {
			auth(session, ret, PrivilegeType.READ);
		}
		return ret;
	}

	public boolean nodeExists(MongoSession session, ObjectId id) {
		Query query = new Query();
		query.addCriteria(Criteria.where(SubNode.FIELD_ID).is(id));
		saveSession(session);
		return ops.exists(query, SubNode.class);
	}

	public SubNode getNode(MongoSession session, ObjectId objId) {
		return getNode(session, objId, true);
	}

	public SubNode getNode(MongoSession session, ObjectId objId, boolean allowAuth) {
		if (objId == null)
			return null;

		saveSession(session);
		SubNode ret = ops.findById(objId, SubNode.class);
		if (allowAuth) {
			auth(session, ret, PrivilegeType.READ);
		}
		return ret;
	}

	public SubNode getParent(MongoSession session, SubNode node) {
		String path = node.getPath();
		if ("/".equals(path)) {
			return null;
		}
		String parentPath = XString.truncateAfterLast(path, "/");
		Query query = new Query();
		query.addCriteria(Criteria.where(SubNode.FIELD_PATH).is(parentPath));
		saveSession(session);
		SubNode ret = ops.findOne(query, SubNode.class);
		auth(session, ret, PrivilegeType.READ);
		return ret;
	}

	public boolean isImageAttached(SubNode node) {
		String mime = node.getStringProp(NodeProp.BIN_MIME.s());
		return ImageUtil.isImageMime(mime);
	}

	public ImageSize getImageSize(SubNode node) {
		return Convert.getImageSize(node);
	}

	public List<SubNode> getChildrenAsList(MongoSession session, SubNode node, boolean ordered, Integer limit) {
		Iterable<SubNode> iter = getChildren(session, node,
				ordered ? Sort.by(Sort.Direction.ASC, SubNode.FIELD_ORDINAL) : null, limit);
		return iterateToList(iter);
	}

	public List<SubNode> iterateToList(Iterable<SubNode> iter) {
		if (!iter.iterator().hasNext()) {
			return null;
		}
		List<SubNode> list = new LinkedList<SubNode>();
		iter.forEach(list::add);
		return list;
	}

	public List<String> getChildrenIds(MongoSession session, SubNode node, boolean ordered, Integer limit) {
		auth(session, node, PrivilegeType.READ);

		Query query = new Query();
		if (limit != null) {
			query.limit(limit.intValue());
		}

		/*
		 * This regex finds all that START WITH "path/" and then end with some other
		 * string that does NOT contain "/", so that we know it's not at a deeper level
		 * of the tree, but is immediate children of 'node'
		 * 
		 * ^:aa:bb:([^:])*$
		 * 
		 * example: To find all DIRECT children (non-recursive) under path /aa/bb regex
		 * is ^\/aa\/bb\/([^\/])*$ (Note that in the java string the \ becomes \\
		 * below...)
		 * 
		 */
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH)
				.regex(regexDirectChildrenOfPath(node == null ? "" : node.getPath()));
		if (ordered) {
			query.with(Sort.by(Sort.Direction.ASC, SubNode.FIELD_ORDINAL));
		}
		query.addCriteria(criteria);

		saveSession(session);
		Iterable<SubNode> iter = ops.find(query, SubNode.class);
		List<String> nodeIds = new LinkedList<String>();
		for (SubNode n : iter) {
			nodeIds.add(n.getId().toHexString());
		}
		return nodeIds;
	}

	/*
	 * If node is null it's path is considered empty string, and it represents the
	 * 'root' of the tree. There is no actual NODE that is root node
	 */
	public Iterable<SubNode> getChildrenUnderParentPath(MongoSession session, String path, Sort sort, Integer limit) {

		Query query = new Query();
		if (limit != null) {
			query.limit(limit.intValue());
		}

		/*
		 * This regex finds all that START WITH "path/" and then end with some other
		 * string that does NOT contain "/", so that we know it's not at a deeper level
		 * of the tree, but is immediate children of 'node'
		 * 
		 * ^:aa:bb:([^:])*$
		 * 
		 * example: To find all DIRECT children (non-recursive) under path /aa/bb regex
		 * is ^\/aa\/bb\/([^\/])*$ (Note that in the java string the \ becomes \\
		 * below...)
		 * 
		 */
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(path));

		/*
		 * This condition ensures that when users create a node and are still editing
		 * that node will be invisible to others until they click "save" todo-1: at some
		 * future time we can write code to find any nodes which are orphaned by a user
		 * creating but never saving changes.
		 */
		criteria = criteria.and(SubNode.FIELD_MODIFY_TIME).ne(null);

		if (sort != null) {
			query.with(sort);
		}

		query.addCriteria(criteria);
		saveSession(session);
		return ops.find(query, SubNode.class);
	}

	/*
	 * If node is null it's path is considered empty string, and it represents the
	 * 'root' of the tree. There is no actual NODE that is root node
	 */
	public Iterable<SubNode> getChildren(MongoSession session, SubNode node, Sort sort, Integer limit) {
		auth(session, node, PrivilegeType.READ);
		return getChildrenUnderParentPath(session, node.getPath(), sort, limit);
	}

	/*
	 * All we need to do here is query for children an do a "max(ordinal)" operation
	 * on that, but digging the information off the web for how to do this appears
	 * to be something that may take a few hours so i'm skipping it for now and just
	 * doing an inverse sort on ORDER and pulling off the top one and using that for
	 * my MAX operation. AFAIK this might even be the most efficient approach. Who
	 * knows. MongoDb is stil the wild wild west of databases.
	 */
	public Long getMaxChildOrdinal(MongoSession session, SubNode node) {
		// Do not delete this commented stuff. Can be helpful to get aggregates
		// working.
		// MatchOperation match = new
		// MatchOperation(Criteria.where("quantity").gt(quantity));
		// GroupOperation group =
		// Aggregation.group("giftCard").sum("giftCard").as("count");
		// Aggregation aggregate = Aggregation.newAggregation(match, group);
		// Order is deprecated
		// AggregationResults<Order> orderAggregate = ops.aggregate(aggregate, "order",
		// Order.class);
		// Aggregation agg = Aggregation.newAggregation(//
		// Aggregation.match(Criteria.where("quantity").gt(1)), //
		// Aggregation.group(SubNode.FIELD_ORDINAL).max().as("count"));
		//
		// AggregationResults<SubNode> results = ops.aggregate(agg, "order",
		// SubNode.class);
		// List<SubNode> orderCount = results.getMappedResults();
		auth(session, node, PrivilegeType.READ);

		// todo-2: research if there's a way to query for just one, rather than simply
		// callingfindOne at the end? What's best practice here?
		Query query = new Query();
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getPath()));
		query.with(Sort.by(Sort.Direction.DESC, SubNode.FIELD_ORDINAL));
		query.addCriteria(criteria);

		saveSession(session);
		// for 'findOne' is it also advantageous to also setup the query criteria with
		// something like LIMIT=1 (sql)?
		SubNode nodeFound = ops.findOne(query, SubNode.class);
		if (nodeFound == null) {
			return 0L;
		}
		return nodeFound.getOrdinal();
	}

	public SubNode getNewestChild(MongoSession session, SubNode node) {
		auth(session, node, PrivilegeType.READ);

		Query query = new Query();
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getPath()));
		query.with(Sort.by(Sort.Direction.DESC, SubNode.FIELD_MODIFY_TIME));
		query.addCriteria(criteria);

		SubNode nodeFound = ops.findOne(query, SubNode.class);
		return nodeFound;
	}

	public SubNode getSiblingAbove(MongoSession session, SubNode node) {
		auth(session, node, PrivilegeType.READ);

		if (node.getOrdinal() == null) {
			throw new RuntimeEx("can't get node above node with null ordinal.");
		}

		// todo-2: research if there's a way to query for just one, rather than simply
		// calling findOne at the end? What's best practice here?
		Query query = new Query();
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getParentPath()));
		query.with(Sort.by(Sort.Direction.DESC, SubNode.FIELD_ORDINAL));
		query.addCriteria(criteria);

		// leave this example. you can do a RANGE like this.
		// query.addCriteria(Criteria.where(SubNode.FIELD_ORDINAL).lt(50).gt(20));
		query.addCriteria(Criteria.where(SubNode.FIELD_ORDINAL).lt(node.getOrdinal()));

		saveSession(session);
		SubNode nodeFound = ops.findOne(query, SubNode.class);
		return nodeFound;
	}

	public SubNode getSiblingBelow(MongoSession session, SubNode node) {
		auth(session, node, PrivilegeType.READ);
		if (node.getOrdinal() == null) {
			throw new RuntimeEx("can't get node above node with null ordinal.");
		}

		// todo-2: research if there's a way to query for just one, rather than simply
		// calling findOne at the end? What's best practice here?
		Query query = new Query();
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(node.getParentPath()));
		query.with(Sort.by(Sort.Direction.ASC, SubNode.FIELD_ORDINAL));
		query.addCriteria(criteria);

		// leave this example. you can do a RANGE like this.
		// query.addCriteria(Criteria.where(SubNode.FIELD_ORDINAL).lt(50).gt(20));
		query.addCriteria(Criteria.where(SubNode.FIELD_ORDINAL).gt(node.getOrdinal()));

		saveSession(session);
		SubNode nodeFound = ops.findOne(query, SubNode.class);
		return nodeFound;
	}

	// todo-1: There is a Query.skip() function on the Query object, that can be
	// used instead of this
	public int skip(Iterator<SubNode> iter, int count) {
		int iterCount = 0;
		for (int i = 0; i < count; i++) {
			if (!iter.hasNext()) {
				break;
			}
			iter.next();
			iterCount++;
		}
		return iterCount;
	}

	/*
	 * Gets (recursively) all nodes under 'node', by using all paths starting with
	 * the path of that node
	 */
	public Iterable<SubNode> getSubGraph(MongoSession session, SubNode node) {
		auth(session, node, PrivilegeType.READ);

		Query query = new Query();
		/*
		 * This regex finds all that START WITH path, have some characters after path,
		 * before the end of the string. Without the trailing (.+)$ we would be
		 * including the node itself in addition to all its children.
		 */
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexRecursiveChildrenOfPath(node.getPath()));
		query.addCriteria(criteria);
		saveSession(session);
		return ops.find(query, SubNode.class);
	}

	/**
	 * prop is optional and if non-null means we should search only that one field.
	 * 
	 * WARNING. "SubNode.prp" is a COLLECTION and therefore not searchable. Beware.
	 */
	public Iterable<SubNode> searchSubGraph(MongoSession session, SubNode node, String prop, String text,
			String sortField, int limit, boolean fuzzy, boolean caseSensitive) {
		auth(session, node, PrivilegeType.READ);

		saveSession(session);
		Query query = new Query();
		query.limit(limit);
		/*
		 * This regex finds all that START WITH path, have some characters after path,
		 * before the end of the string. Without the trailing (.+)$ we would be
		 * including the node itself in addition to all its children.
		 */
		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexRecursiveChildrenOfPath(node.getPath()));

		/*
		 * This condition ensures that when users create a node and are still editing
		 * that node will be invisible to others until they click "save" todo-1: at some
		 * future time we can write code to find any nodes which are orphaned by a user
		 * creating but never saving changes.
		 */
		criteria = criteria.and(SubNode.FIELD_MODIFY_TIME).ne(null);

		query.addCriteria(criteria);

		if (!StringUtils.isEmpty(text)) {

			if (fuzzy) {
				if (StringUtils.isEmpty(prop)) {
					prop = SubNode.FIELD_CONTENT;
				}

				if (caseSensitive) {
					query.addCriteria(Criteria.where(prop).regex(text));
				} else {
					// i==insensitive (case)
					query.addCriteria(Criteria.where(prop).regex(text, "i"));
				}
			} else {
				// /////
				// Query query = Query.query(
				// Criteria.where("aBooleanProperty").is(true).
				// and(anIntegerProperty).is(1)).
				// addCriteria(TextCriteria.
				// forLanguage("en"). // effectively the same as forDefaultLanguage() here
				// matching("a text that is indexed for full text search")));

				// List<YourDocumentType> result = mongoTemplate.findAll(query.
				// YourDocumentType.class);
				// /////

				TextCriteria textCriteria = TextCriteria.forDefaultLanguage();
				populateTextCriteria(textCriteria, text);
				textCriteria.caseSensitive(caseSensitive);
				query.addCriteria(textCriteria);
			}
		}

		if (!StringUtils.isEmpty(sortField)) {
			// todo-1: sort dir is being passed from client but not used here?
			query.with(Sort.by(Sort.Direction.DESC, sortField));
		}

		return ops.find(query, SubNode.class);
	}

	public Iterable<SubNode> searchSubGraphByAcl(MongoSession session, SubNode node, String sortField, int limit) {
		auth(session, node, PrivilegeType.READ);

		saveSession(session);
		Query query = new Query();
		query.limit(limit);
		/*
		 * This regex finds all that START WITH path, have some characters after path,
		 * before the end of the string. Without the trailing (.+)$ we would be
		 * including the node itself in addition to all its children.
		 */

		Criteria criteria = Criteria.where(SubNode.FIELD_PATH).regex(regexRecursiveChildrenOfPath(node.getPath())) //
				.and(SubNode.FIELD_AC).ne(null);

		// examples from online:
		// Aggregation aggregation = Aggregation.newAggregation(
		// Aggregation.match(Criteria.where("docs").exists(true)));
		// Aggregation aggregation =
		// Aggregation.newAggregation(Aggregation.match(Criteria.where("docs").ne(Collections.EMPTY_LIST)));
		// Criteria.where("docs").not().size(0);

		query.addCriteria(criteria);

		if (!StringUtils.isEmpty(sortField)) {
			query.with(Sort.by(Sort.Direction.DESC, sortField));
		}

		return ops.find(query, SubNode.class);
	}

	/*
	 * Builds the 'criteria' object using the kind of searching Google does where
	 * anything in quotes is considered a phrase and anything else separated by
	 * spaces are separate search terms.
	 */
	public static void populateTextCriteria(TextCriteria criteria, String text) {
		String regex = "\"([^\"]*)\"|(\\S+)";

		Matcher m = Pattern.compile(regex).matcher(text);
		while (m.find()) {
			if (m.group(1) != null) {
				String str = m.group(1);
				log.debug("SEARCH: Quoted [" + str + "]");
				criteria.matchingPhrase(str);
			} else {
				String str = m.group(2);
				log.debug("SEARCH: Plain [" + str + "]");
				criteria.matching(str);
			}
		}
	}

	public int dump(String message, Iterable<SubNode> iter) {
		int count = 0;
		log.debug("    " + message);
		for (SubNode node : iter) {
			log.debug("    DUMP node: " + XString.prettyPrint(node));
			count++;
		}
		log.debug("DUMP count=" + count);
		return count;
	}

	public void rebuildIndexes(MongoSession session) {
		dropAllIndexes(session);
		createAllIndexes(session);
	}

	public void createAllIndexes(MongoSession session) {
		try {
			// dropIndex(session, SubNode.class, SubNode.FIELD_PATH + "_1");
			dropIndex(session, SubNode.class, SubNode.FIELD_NAME + "_1");
		} catch (Exception e) {
			log.debug("no field name index found. ok. this is fine.");
		}
		log.debug("creating all indexes.");

		createUniqueIndex(session, SubNode.class, SubNode.FIELD_PATH_HASH);

		/*
		 * NOTE: Every non-admin owned noded must have only names that are prefixed with
		 * "UserName--" of the user. That is, prefixed by their username followed by two
		 * dashes
		 */
		createIndex(session, SubNode.class, SubNode.FIELD_NAME);

		createIndex(session, SubNode.class, SubNode.FIELD_ORDINAL);
		createIndex(session, SubNode.class, SubNode.FIELD_MODIFY_TIME, Direction.DESC);
		createIndex(session, SubNode.class, SubNode.FIELD_CREATE_TIME, Direction.DESC);
		createTextIndexes(session, SubNode.class);

		logIndexes(session, SubNode.class);
	}

	public void dropAllIndexes(MongoSession session) {
		requireAdmin(session);
		saveSession(session);
		ops.indexOps(SubNode.class).dropAllIndexes();
	}

	public void dropIndex(MongoSession session, Class<?> clazz, String indexName) {
		requireAdmin(session);
		log.debug("Dropping index: " + indexName);
		saveSession(session);
		ops.indexOps(clazz).dropIndex(indexName);
	}

	public void logIndexes(MongoSession session, Class<?> clazz) {
		StringBuilder sb = new StringBuilder();
		saveSession(session);
		List<IndexInfo> indexes = ops.indexOps(clazz).getIndexInfo();
		for (IndexInfo idx : indexes) {
			List<IndexField> indexFields = idx.getIndexFields();
			sb.append("INDEX EXISTS: " + idx.getName() + "\n");
			for (IndexField idxField : indexFields) {
				sb.append("    " + idxField.toString() + "\n");
			}
		}
		log.debug(sb.toString());
	}

	public void createUniqueIndex(MongoSession session, Class<?> clazz, String property) {
		requireAdmin(session);
		saveSession(session);
		ops.indexOps(clazz).ensureIndex(new Index().on(property, Direction.ASC).unique());
	}

	public void createIndex(MongoSession session, Class<?> clazz, String property) {
		requireAdmin(session);
		saveSession(session);
		ops.indexOps(clazz).ensureIndex(new Index().on(property, Direction.ASC));
	}

	public void createIndex(MongoSession session, Class<?> clazz, String property, Direction dir) {
		requireAdmin(session);
		saveSession(session);
		ops.indexOps(clazz).ensureIndex(new Index().on(property, dir));
	}

	/*
	 * DO NOT DELETE.
	 * 
	 * I tried to create just ONE full text index, and i get exceptions, and even if
	 * i try to build a text index on a specific property I also get exceptions, so
	 * currently i am having to resort to using only the createTextIndexes() below
	 * which does the 'onAllFields' option which DOES work for some readonly
	 */
	// public void createUniqueTextIndex(MongoSession session, Class<?> clazz,
	// String property) {
	// requireAdmin(session);
	//
	// TextIndexDefinition textIndex = new
	// TextIndexDefinitionBuilder().onField(property).build();
	//
	// /* If mongo will not allow dupliate checks of a text index, i can simply take
	// a HASH of the
	// content text, and enforce that's unique
	// * and while i'm at it secondarily use it as a corruption check.
	// */
	// /* todo-2: haven't yet run my test case that verifies duplicate tree paths
	// are indeed
	// rejected */
	// DBObject dbo = textIndex.getIndexOptions();
	// dbo.put("unique", true);
	// dbo.put("dropDups", true);
	//
	// ops.indexOps(clazz).ensureIndex(textIndex);
	// }

	public void createTextIndexes(MongoSession session, Class<?> clazz) {
		requireAdmin(session);

		TextIndexDefinition textIndex = new TextIndexDefinitionBuilder().onAllFields()
				// .onField(SubNode.FIELD_PROPERTIES+"."+NodeProp.CONTENT)
				.build();

		saveSession(session);
		ops.indexOps(clazz).ensureIndex(textIndex);
	}

	public void dropCollection(MongoSession session, Class<?> clazz) {
		requireAdmin(session);
		ops.dropCollection(clazz);
	}

	public String regexDirectChildrenOfPath(String path) {
		path = XString.stripIfEndsWith(path, "/");
		return "^" + Pattern.quote(path) + "\\/([^\\/])*$";
	}

	/*
	 * todo-2: I think now that I'm including the trailing slash after path in this
	 * regex that I can remove the (.+) piece? I think i need to write some test
	 * cases just to test my regex functions!
	 * 
	 * todo-1: Also what's the 'human readable' description of what's going on here?
	 * substring or prefix? For performance we DO want this to be finding all nodes
	 * that 'start with' the path as opposed to simply 'contain' the path right? To
	 * make best use of indexes etc?
	 */
	public String regexRecursiveChildrenOfPath(String path) {
		path = XString.stripIfEndsWith(path, "/");
		return "^" + Pattern.quote(path) + "\\/(.+)$";
	}

	public SubNode createUser(MongoSession session, String user, String email, String password, boolean automated) {
		// if (PrincipalName.ADMIN.s().equals(user)) {
		// throw new RuntimeEx("createUser should not be called fror admin
		// user.");
		// }

		requireAdmin(session);
		String newUserNodePath = NodeName.ROOT_OF_ALL_USERS + "/?";
		// todo-1: is user validated here (no invalid characters, etc. and invalid
		// flowpaths tested?)

		SubNode userNode = createNode(session, newUserNodePath, NodeType.ACCOUNT.s());
		ObjectId id = new ObjectId();
		userNode.setId(id);
		userNode.setOwner(id);
		userNode.setProp(NodeProp.USER.s(), user);
		userNode.setProp(NodeProp.EMAIL.s(), email);
		userNode.setProp(NodeProp.PWD_HASH.s(), getHashOfPassword(password));
		userNode.setProp(NodeProp.USER_PREF_EDIT_MODE.s(), false);
		userNode.setProp(NodeProp.USER_PREF_EDIT_MODE.s(), false);
		userNode.setProp(NodeProp.BIN_TOTAL.s(), 0);
		userNode.setProp(NodeProp.LAST_LOGIN_TIME.s(), 0);
		userNode.setProp(NodeProp.BIN_QUOTA.s(), Const.DEFAULT_USER_QUOTA);

		userNode.setContent("### Account: " + user);

		if (!automated) {
			userNode.setProp(NodeProp.SIGNUP_PENDING.s(), true);
		}

		save(session, userNode);
		return userNode;
	}

	/*
	 * Accepts either the 'user' or the 'userNode' for the user. It's best tp pass
	 * userNode if you know it, to save cycles
	 */
	public SubNode getUserNodeByType(MongoSession session, String user, SubNode userNode, String nodeName,
			String type) {
		if (userNode == null) {
			userNode = getUserNodeByUserName(session, user);
		}

		if (userNode == null) {
			log.warn("userNode not found for user name: " + user);
			return null;
		}

		String path = userNode.getPath();
		SubNode node = findTypedNodeUnderPath(session, path, type);

		if (node == null) {
			node = createNode(session, userNode, null, type, 0L, CreateNodeLocation.LAST, null);
			node.setOwner(userNode.getId());
			node.setContent(nodeName);

			/*
			 * todo-1: and make this some kind of hook so that we don't have an ugly tight
			 * coupling here for this type, although this technical debt isn't that bad
			 */
			if (type.equals(NodeType.USER_FEED.s())) {
				List<String> privileges = new LinkedList<String>();
				privileges.add(PrivilegeType.READ.s());
				privileges.add(PrivilegeType.WRITE.s());
				aclService.addPrivilege(session, node, "public", privileges, null);
			}

			save(session, node);

			if (type.equals(NodeType.USER_FEED.s())) {
				userFeedService.addUserFeedInfo(session, node, null, sessionContext.getUserName());
			}
		}
		return node;
	}

	public SubNode getTrashNode(MongoSession session, String user, SubNode userNode) {
		if (userNode == null) {
			userNode = getUserNodeByUserName(session, user);
		}

		if (userNode == null) {
			log.warn("userNode not found for user name: " + user);
			return null;
		}

		String path = userNode.getPath() + "/" + NodeName.TRASH;
		SubNode node = getNode(session, path);

		if (node == null) {
			node = createNode(session, userNode, NodeName.TRASH, NodeType.TRASH_BIN.s(), 0L, CreateNodeLocation.LAST,
					null);
			node.setOwner(userNode.getId());
			save(session, node);
		}
		return node;
	}

	public SubNode getUserNodeByUserName(MongoSession session, String user) {
		if (session == null) {
			session = getAdminSession();
		}

		if (user == null) {
			user = sessionContext.getUserName();
		}
		user = user.trim();

		// For the ADMIN user their root node is considered to be the entire root of the
		// whole DB
		if (PrincipalName.ADMIN.s().equalsIgnoreCase(user)) {
			return getNode(session, "/" + NodeName.ROOT);
		}

		// Other wise for ordinary users root is based off their username
		Query query = new Query();
		Criteria criteria = Criteria.where(//
				SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(NodeName.ROOT_OF_ALL_USERS))//
				.and(SubNode.FIELD_PROPERTIES + "." + NodeProp.USER + ".value").is(user);

		query.addCriteria(criteria);
		saveSession(session);
		SubNode ret = ops.findOne(query, SubNode.class);
		auth(session, ret, PrivilegeType.READ);
		return ret;
	}

	/*
	 * Finds the first node matching 'type' under 'path' (non-recursively, direct
	 * children only)
	 */
	public SubNode findTypedNodeUnderPath(MongoSession session, String path, String type) {

		// Other wise for ordinary users root is based off their username
		Query query = new Query();
		Criteria criteria = Criteria.where(//
				SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(path))//
				.and(SubNode.FIELD_TYPE).is(type);

		query.addCriteria(criteria);
		saveSession(session);
		SubNode ret = ops.findOne(query, SubNode.class);
		auth(session, ret, PrivilegeType.READ);
		return ret;
	}

	/*
	 * Returns one (or first) node contained directly under path (non-recursively)
	 * that has a matching propName and propVal
	 */
	public SubNode findSubNodeByProp(MongoSession session, String path, String propName, String propVal) {

		// Other wise for ordinary users root is based off their username
		Query query = new Query();
		Criteria criteria = Criteria.where(//
				SubNode.FIELD_PATH).regex(regexDirectChildrenOfPath(path))//
				.and(SubNode.FIELD_PROPERTIES + "." + propName + ".value").is(propVal);

		query.addCriteria(criteria);
		saveSession(session);
		SubNode ret = ops.findOne(query, SubNode.class);
		auth(session, ret, PrivilegeType.READ);
		return ret;
	}

	public MongoSession login(String userName, String password) {
		// log.debug("Mongo API login: user="+userName);
		MongoSession session = MongoSession.createFromUser(PrincipalName.ANON.s());

		/*
		 * If username is null or anonymous, we assume anonymous is acceptable and
		 * return anonymous session or else we check the credentials.
		 */
		if (!PrincipalName.ANON.s().equals(userName)) {
			log.trace("looking up user node.");
			SubNode userNode = getUserNodeByUserName(getAdminSession(), userName);
			boolean success = false;

			if (userNode != null) {

				/*
				 * If logging in as ADMIN we don't expect the node to contain any password in
				 * the db, but just use the app property instead.
				 */
				if (password.equals(appProp.getMongoAdminPassword())) {
					success = true;
				}
				// else it's an ordinary user so we check the password against their user node
				else if (userNode.getStringProp(NodeProp.PWD_HASH.s()).equals(getHashOfPassword(password))) {
					success = true;
				}
			}

			if (success) {
				session.setUser(userName);
				session.setUserNode(userNode);
			} else {
				throw new RuntimeEx("Login failed.");
			}
		}
		return session;
	}

	public void initSystemRootNode() {
		systemRootNode = getNode(adminSession, "/r");
	}

	/*
	 * Initialize admin user account credentials into repository if not yet done.
	 * This should only get triggered the first time the repository is created, the
	 * first time the app is started.
	 * 
	 * The admin node is also the repository root node, so it owns all other nodes,
	 * by the definition of they way security is inheritive.
	 */
	public void createAdminUser(MongoSession session) {
		String adminUser = appProp.getMongoAdminUserName();

		SubNode adminNode = getUserNodeByUserName(getAdminSession(), adminUser);
		if (adminNode == null) {
			adminNode = apiUtil.ensureNodeExists(session, "/", NodeName.ROOT, "Repository Root", NodeType.REPO_ROOT.s(),
					true, null, null);

			adminNode.setProp(NodeProp.USER.s(), PrincipalName.ADMIN.s());

			// todo-1: need to store ONLY hash of the password
			adminNode.setProp(NodeProp.USER_PREF_EDIT_MODE.s(), false);
			save(session, adminNode);

			apiUtil.ensureNodeExists(session, "/" + NodeName.ROOT, NodeName.USER, "Root of All Users", null, true, null,
					null);
			apiUtil.ensureNodeExists(session, "/" + NodeName.ROOT, NodeName.OUTBOX, "System Email Outbox", null, true,
					null, null);
		}

		createPublicNodes(session);
	}

	public void createPublicNodes(MongoSession session) {
		ValContainer<Boolean> created = new ValContainer<>();
		SubNode publicNode = apiUtil.ensureNodeExists(session, "/" + NodeName.ROOT, NodeName.PUBLIC, "Public", null,
				true, null, created);

		if (created.getVal()) {
			aclService.addPrivilege(session, publicNode, PrincipalName.PUBLIC.s(),
					Arrays.asList(PrivilegeType.READ.s()), null);
		}

		/* Ensure Content folder is created and synced to file system */
		// SubNodePropertyMap props = new SubNodePropertyMap();
		// props.put(TYPES.FILE_SYNC_LINK.getName(), new
		// SubNodePropVal(appProp.publicContentFolder()));
		// SubNode contentNode = apiUtil.ensureNodeExists(session, "/" + NodeName.ROOT +
		// "/" + NodeName.PUBLIC, "content",
		// null, TYPES.FILE_SYNC_ROOT.getName(), true, props, created);

		// // ---------------------------------------------------------
		// // NOTE: Do not delete this. May need this example in the future. This is
		// // formerly the way we loaded the static
		// // site content (landing page, etc) for the app, before using the Folder
		// Synced
		// // "content" folder which we currently use.
		// // ImportZipService importZipService = (ImportZipService)
		// // SpringContextUtil.getBean(ImportZipService.class);
		// // importZipService.inputZipFileFromResource(session, "classpath:home.zip",
		// // publicNode, NodeName.HOME);
		// // ---------------------------------------------------------
		// SubNode node = getNode(session, "/" + NodeName.ROOT + "/" + NodeName.PUBLIC +
		// "/" + NodeName.HOME);
		// if (node == null) {
		// log.debug("Public node didn't exist. Creating.");
		// node = getNode(session, "/" + NodeName.ROOT + "/" + NodeName.PUBLIC + "/" +
		// NodeName.HOME);
		// if (node == null) {
		// log.debug("Error reading node that was just imported.");
		// } else {
		// long childCount = getChildCount(node);
		// log.debug("Verified Home Node has " + childCount + " children.");
		// }
		// } else {
		// long childCount = getChildCount(node);
		// log.debug("Home node already existed with " + childCount + " children");
		// }
	}
}
