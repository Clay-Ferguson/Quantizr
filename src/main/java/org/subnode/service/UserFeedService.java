package org.subnode.service;

import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;
import org.subnode.AppServer;
import org.subnode.config.NodeName;
import org.subnode.config.SessionContext;
import org.subnode.model.NodeInfo;
import org.subnode.model.UserFeedInfo;
import org.subnode.model.UserFeedItem;
import org.subnode.model.client.NodeProp;
import org.subnode.model.client.NodeType;
import org.subnode.mongo.MongoRead;
import org.subnode.mongo.MongoSession;
import org.subnode.mongo.RunAsMongoAdminEx;
import org.subnode.mongo.model.SubNode;
import org.subnode.request.NodeFeedRequest;
import org.subnode.response.FeedPushInfo;
import org.subnode.response.NodeFeedResponse;
import org.subnode.response.ServerPushInfo;
import org.subnode.util.Convert;
import org.subnode.util.ThreadLocals;

/**
 * Service methods for maintaining 'in-memory' lists of the most recent UserFeed
 * posts of all users, to allow extremely fast construction of any person's
 * consolidated feed.
 */
@Component
public class UserFeedService {
	private static final Logger log = LoggerFactory.getLogger(UserFeedService.class);

	@Autowired
	private MongoRead read;

	@Autowired
	private RunAsMongoAdminEx adminRunner;

	@Autowired
	private Convert convert;

	@Autowired
	private ActPubService actPubService;

	@Autowired
	private SessionContext sessionContext;

	/*
	 * Map key is userName. For each user we keep a UserFeedInfo which holds the
	 * timeline of all their Outbox, so that we can generate a Feed for any user by
	 * combining together from memory the feeds of all their friends without doing a
	 * DB query
	 */
	static HashMap<String, UserFeedInfo> userFeedInfoMapByUserName = new HashMap<String, UserFeedInfo>();

	/*
	 * Map to allow ability to lookup any UserFeedInfo by the path of the feed node,
	 * so the key is the path
	 */
	static HashMap<String, UserFeedInfo> userFeedInfoMapByPath = new HashMap<String, UserFeedInfo>();

	static HashMap<String, NodeInfo> nodeInfoMapByPath = new HashMap<String, NodeInfo>();

	static final boolean verboseLog = false;
	static final int MAX_FEED_ITEMS = 100;

	/* Runs immediately at startup, and then every 30 minutes run a full reinit. */
	@Scheduled(fixedDelay = 30 * 60 * 1000)
	public void run() {
		if (AppServer.isShuttingDown() || !AppServer.isEnableScheduling()) {
			log.debug("ignoring UserFeedService schedule cycle");
			return;
		}

		log.debug("UserFeedService Scheduler running init()");
		init();
	}

	public void init() {
		log.debug("UserFeedService.init()");

		synchronized (userFeedInfoMapByUserName) {
			userFeedInfoMapByUserName.clear();
			userFeedInfoMapByPath.clear();

			adminRunner.run(session -> {
				/* Query for all user account nodes */
				Iterable<SubNode> accountNodes = read.getChildrenUnderParentPath(session, NodeName.ROOT_OF_ALL_USERS,
						null, null, 0);

				/* Run addUserFeedInfo for each account */
				for (SubNode accountNode : accountNodes) {
					String userName = accountNode.getStrProp(NodeProp.USER);

					if (userFeedInfoMapByUserName.containsKey(userName)) {
						log.error("ERROR: Multiple accounts named " + userName
								+ " skipping redundant one for UserFeedService initializing.");
						continue;
					}

					log.debug("User " + userName + ". NodeId=" + accountNode.getId().toHexString());
					addUserFeedInfo(session, null, accountNode, userName);
				}
				return null;
			});
		}
	}

	/**
	 * Loads into our static singleton maps the latest 25 feed items for the given
	 * user, so that this info will be in memory to be able to be rapidly accessed
	 * from memory by requests by any followers needing to build up their
	 * consolidated feeds for the users they're following.
	 *
	 * If feedNode is already available, it can be passed in, or else accountNode
	 * must be passed in, so it can be used to get the feedNode
	 * 
	 * todo-1: passing userName in as a param is redundant. get it from accountNode.
	 */
	public void addUserFeedInfo(MongoSession session, SubNode feedNode, SubNode accountNode, String userName) {
		log.debug("addUserFeedInfo: " + userName);
		UserFeedInfo userFeedInfo = new UserFeedInfo();
		userFeedInfo.setUserName(userName);

		if (userName.contains("@")) {
			log.debug("Noticed user is foreign. Refreshing from their outbox: " + userName);
			actPubService.loadForeignUser(session, userName);
		}

		if (feedNode == null) {
			feedNode = read.findTypedNodeUnderPath(session, accountNode.getPath(), NodeType.USER_FEED.s());
		}

		if (feedNode != null) {
			log.debug("Found UserFeed Node to get Timeline of: " + feedNode.getId().toHexString());

			/* Process all the nodes under this user's USER_FEED node */
			for (SubNode node : read.searchSubGraph(session, feedNode, null, "", SubNode.FIELD_MODIFY_TIME, 25, false,
					false)) {

				UserFeedItem userFeedItem = new UserFeedItem();
				userFeedItem.setUserName(userName);
				userFeedItem.setNodeId(node.getId());
				userFeedItem.setModTime(node.getModifyTime());
				userFeedItem.setNode(node);
				userFeedInfo.getUserFeedList().add(userFeedItem);

				if (verboseLog) {
					log.debug("    UserFeed ITEM: " + node.getId().toHexString());
				}
			}
		}

		log.debug("UserFeedInfo [hashcode=" + userFeedInfo.hashCode() + "] of user " + userFeedInfo.getUserName()
				+ " has count=" + userFeedInfo.getUserFeedList().size());

		/*
		 * NOTE: Even if we don't have any posts yet in userFeedInfo, we still add to
		 * the cache.
		 */
		synchronized (userFeedInfoMapByUserName) {
			userFeedInfoMapByUserName.put(userName, userFeedInfo);
			if (feedNode != null) {
				userFeedInfoMapByPath.put(feedNode.getPath(), userFeedInfo);
			}
		}
	}

	/*
	 * Our MongEventListener calls this every time a node is saved to give us a
	 * chance to see if it's a child (or decendent at any level deep) of a feed
	 * node, and needs to be cached as a userFeedItem
	 */
	public UserFeedInfo findAncestorUserFeedInfo(MongoSession session, SubNode node) {

		// log.debug("UserFeedService.findAncestorUserFeedInfo: user " +
		// sessionContext.getUserName() + ": id="
		// + node.getId().toHexString());
		/*
		 * We check the parent node AND all ancestors nodes, of 'node', to see if any of
		 * them are a feed node that we have cached because if so then we'll update our
		 * cache by adding it into the cache, and be creaful to remove it before adding
		 * it in at top so that we don't have any duplicates
		 */
		String path = node.getPath();
		while (true) {
			int lastSlashIdx = path.lastIndexOf("/");

			// if no more slashes, we're done
			if (lastSlashIdx <= 0)
				break;

			path = path.substring(0, lastSlashIdx);
			// log.debug(" subpath:" + path);
			UserFeedInfo userFeedInfo = userFeedInfoMapByPath.get(path);
			if (userFeedInfo != null) {
				// log.debug(" SubPath part IS a feed: " + path);
				return userFeedInfo;
			}
		}
		return null;
	}

	/*
	 * Ensure the 'node' is in the userFeedInfo by creating or updating if it
	 * already is there. When called we already know 'node' is a descendant of
	 * someone's USER_FEED node and so it does need to be added into the cache.
	 */
	public void ensureNodeInUserFeedInfo(MongoSession session, UserFeedInfo userFeedInfo, SubNode node) {
		UserFeedItem userFeedItem = null;

		// log.debug("Node is a descendant of userFeed for user " +
		// userFeedInfo.getUserName() + " content="
		// + node.getContent());

		// first scan to see if we already have a userFeedItem for this node
		for (UserFeedItem ufi : userFeedInfo.getUserFeedList()) {
			if (ufi.getNodeId().equals(node.getId())) {
				userFeedItem = ufi;
				// log.debug("ensureNodeInuserFeedInfo: feed Info did already contain the
				// node.");
				break;
			}
		}

		if (userFeedItem == null) {
			// log.debug("Creating a new item to add into feed.");
			userFeedItem = new UserFeedItem();
			userFeedItem.setNodeId(node.getId());
			userFeedInfo.getUserFeedList().add(userFeedItem);
		}

		userFeedItem.setModTime(node.getModifyTime());
		userFeedItem.setNode(node);
		userFeedItem.setUserName(userFeedInfo.getUserName());

		pushNodeUpdateToAllFriends(session, node);
	}

	/*
	 * This will result in a push that makes everyone following the owner of node
	 * (as one of their friends), have their feed information updated in realtime in
	 * their browser without requiring a database query
	 */
	private void pushNodeUpdateToAllFriends(MongoSession session, SubNode node) {
		log.debug("Pushing update to all friends: from user " + sessionContext.getUserName() + ": id="
				+ node.getId().toHexString());
		Set<String> keys = null;

		/*
		 * all we do in this synchronized block is get keys because we need to release
		 * this lock FAST since it has the effect of making logins or other critical
		 * processes block while locked
		 */
		synchronized (SessionContext.sessionsByUserName) {
			keys = SessionContext.sessionsByUserName.keySet();
		}

		NodeInfo nodeInfo = convert.convertToNodeInfo(sessionContext, session, node, true, false, 1, false, false);
		lookupParent(session, nodeInfo, node.getPath());

		/* Iterate each session one at a time */
		for (String key : keys) {
			SessionContext sc = SessionContext.sessionsByUserName.get(key);
			if (sc != null) {
				pushNodeNotificationToSession(session, sc, node, nodeInfo);
			}
		}
	}

	/* We allow nodeInfo to be null, and we generate it on demand if it is */
	public void pushNodeNotificationToSession(MongoSession session, SessionContext sc, SubNode node,
			NodeInfo nodeInfo) {
		// log.debug("Processing a session to maybe push to:" + sc.getUserName());

		/*
		 * Check if the owner of 'node' is in the list of accounts the sessionContext
		 * has as frieldList, and this only finds it if this user has viewed their feed
		 * since logging in, otherwise there's nothign to do here
		 */
		if (sc.getFeedUserNodeIds() != null && sc.getFeedUserNodeIds().contains(node.getOwner().toHexString())) {
			// log.debug("USER GETTING A PUSH: " + sc.getUserName());

			if (nodeInfo == null) {
				nodeInfo = convert.convertToNodeInfo(sc, session, node, true, false, 1, false, false);
				lookupParent(session, nodeInfo, node.getPath());
			}

			sendServerPushInfo(sc.getUserName(), new FeedPushInfo(nodeInfo));
		}
	}

	public void sendServerPushInfo(String recipientUserName, ServerPushInfo info) {
		SessionContext userSession = SessionContext.getSessionByUserName(recipientUserName);

		// If user is currently logged in we have a session here.
		if (userSession != null) {
			SseEmitter pushEmitter = userSession.getPushEmitter();
			if (pushEmitter != null) {
				ExecutorService sseMvcExecutor = Executors.newSingleThreadExecutor();
				sseMvcExecutor.execute(() -> {
					try {
						SseEventBuilder event = SseEmitter.event() //
								.data(info) //
								.id(String.valueOf(info.hashCode()))//
								.name(info.getType());
						pushEmitter.send(event);

						// DO NOT DELETE. This way of sending also works, and I was originally doing it
						// this way and picking up
						// in eventSource.onmessage = e => {} on the browser, but I decided to use the
						// builder instead and let
						// the 'name' in the builder route different objects to different event
						// listeners on the client. Not really sure
						// if either approach has major advantages over the other.
						// pushEmitter.send(info, MediaType.APPLICATION_JSON);
					} catch (Exception ex) {
						pushEmitter.completeWithError(ex);
					}
				});
			}
		}
	}

	/* Called whenever a node is deleted to get it out of the memory cache */
	public void nodeDeleteNotify(String nodeId) {
		synchronized (userFeedInfoMapByUserName) {
			for (UserFeedInfo ufinf : userFeedInfoMapByUserName.values()) {
				UserFeedItem itemFound = null;

				for (UserFeedItem ufi : ufinf.getUserFeedList()) {
					if (ufi.getNodeId().toHexString().equals(nodeId)) {
						itemFound = ufi;
						break; // break inner loop
					}
				}

				if (itemFound != null) {
					// todo-1: this won't yet update browsers automatically if something's deleted,
					// and I'm not sure this is important to have.
					ufinf.getUserFeedList().remove(itemFound);
					break; // break outter loop (returns)
				}
			}
		}
	}

	/*
	 * req is is expected to specify a FRIEND_LIST node with FRIEND types under it,
	 * and we generate a feed based on that set of friends to then display in the
	 * feed tab.
	 * 
	 * If apUserName is set on the request we generate the feed of just that user's
	 * outbox.
	 * 
	 * Currently req.nodeId is always just "~sn:friendList" (Note the tilde-prefix
	 * syntax designating it's a special node type (i.e. not a name, path, or id))
	 * 
	 * todo-0: this code does not yet distinguish between req.getServerFilter=="local" v.s. "federated"
	 */
	public NodeFeedResponse friendsFeed(MongoSession session, NodeFeedRequest req) {
		/*
		 * todo-1: This is TEMPORARY, we will end up keeping userFeedService up to date
		 * another way later. For now we could at least add an admin menu option to run
		 * this on demand ?
		 */
		init();

		NodeFeedResponse res = new NodeFeedResponse();
		if (session == null) {
			session = ThreadLocals.getMongoSession();
		}
		int MAX_NODES = 100;
		int counter = 0;

		SubNode friendListNode = read.getNode(session, req.getNodeId());
		if (friendListNode == null) {
			return res;
		}
		if (!friendListNode.getType().equals(NodeType.FRIEND_LIST.s())) {
			throw new RuntimeException("only FRIEND_LIST type nodes can generate a feed.");
		}

		/*
		 * This collection will hold the merged list of all the Outbox content of all
		 * Friends
		 */
		List<UserFeedItem> fullFeedList = new LinkedList<UserFeedItem>();

		/*
		 * we store the set of the currently active userNodeIds in the session, so that
		 * directly from the user's session memory we can tell who all the users are in
		 * the feed they are now viewing
		 */
		HashSet<String> userNodeIds = new HashSet<String>();

		if (StringUtils.isEmpty(req.getFeedUserName())) {
			/*
			 * We have to add in ourselves here so that we get our own feed to include our
			 * own posts
			 */
			userNodeIds.add(sessionContext.getRootId());
		}

		/* Get all friend nodes the user has created */
		Iterable<SubNode> friendNodes = read.getChildrenUnderParentPath(session, friendListNode.getPath(), null,
				MAX_NODES, -1);

		// Process all friends, to accumulate all of fullFeedList items
		for (SubNode friendNode : friendNodes) {

			/* If we aren't following this friend, then ignore and skip to next friend */
			String following = friendNode.getStrProp(NodeProp.ACT_PUB_FOLLOWING.s());
			if (!"true".equals(following)) {
				continue;
			}

			// get userNodeId off friend node
			String userNodeId = friendNode.getStrProp(NodeProp.USER_NODE_ID.s());
			if (userNodeId == null) {
				log.warn("user node id missing on node: " + friendNode.getId().toHexString());
				continue;
			}

			// get user name of this friend
			String friendUserName = friendNode.getStrProp(NodeProp.USER.s());
			if (friendUserName == null) {
				log.warn("user missing on node: " + friendNode.getId().toHexString());
				continue;
			}

			/* If we're limiting to just one friend and this isn't them, then ignore */
			if (!StringUtils.isEmpty(req.getFeedUserName()) && !friendUserName.equals(req.getFeedUserName())) {
				continue;
			}

			userNodeIds.add(userNodeId);
			log.debug("user " + sessionContext.getUserName() + " has friend: " + friendUserName);

			/*
			 * If there is an '@' symbol in the user name then it's a foreign user and we
			 * need to sync their outbox from foreign ActivityPub server
			 * 
			 * todo-0: Need to finalize a strategy for how to (i.e. when) to actually run
			 * this refresh code. Currently during development we run it every time the user
			 * is requesting a feed. Obviously this approach will not scale at all.
			 * 
			 * Theoretically can we just run this code only once at startup, and then expect
			 * the incomming messages from other federated servers to keep the information
			 * up to date? That is, we want to avoid executing loadForeignUser until
			 * absoluely necessary because that involves several HTML calls to a remote
			 * Fediserver for EACH user.
			 */
			boolean isApNode = friendUserName.contains("@");
			if (isApNode) {
				log.debug("feedNode reading an AP user: " + friendUserName);
				adminRunner.run(s -> {
					SubNode accountNode = read.getUserNodeByUserName(s, friendUserName);
					addUserFeedInfo(s, null, accountNode, friendUserName);
					return null;
				});
			}

			/*
			 * Look up the cached Outbox nodes (in memory) and add all of 'userName' cached
			 * items into the full feed list
			 */
			synchronized (UserFeedService.userFeedInfoMapByUserName) {
				UserFeedInfo userFeedInfo = UserFeedService.userFeedInfoMapByUserName.get(friendUserName);
				if (userFeedInfo != null) {
					if (verboseLog) {
						for (UserFeedItem ufi : userFeedInfo.getUserFeedList()) {
							log.debug("Friend: " + friendUserName + " post.content: " + ufi.getNode().getContent());
						}
					}

					fullFeedList.addAll(userFeedInfo.getUserFeedList());
				}
			}
		}

		if (StringUtils.isEmpty(req.getFeedUserName())) {
			/*
			 * Now add the feed of the current user because a user should be able to see his
			 * own posts appear in the feed
			 */
			synchronized (UserFeedService.userFeedInfoMapByUserName) {
				// log.debug("Now adding in our own feed posts: " +
				// sessionContext.getUserName());
				UserFeedInfo userFeedInfo = UserFeedService.userFeedInfoMapByUserName.get(sessionContext.getUserName());

				if (userFeedInfo != null) {

					// log.debug("UserFeedInfo [hashcode=" + userFeedInfo.hashCode() + "] of user "
					// + userFeedInfo.getUserName()
					// + " has count=" + userFeedInfo.getUserFeedList().size());

					// for (UserFeedItem ufi : userFeedInfo.getUserFeedList()) {
					// log.debug("NODE: " + ufi.getNode().getOwner().toHexString() + " content="
					// + ufi.getNode().getContent());
					// }

					fullFeedList.addAll(userFeedInfo.getUserFeedList());
				} else {
					log.debug("oops there isn't a userFeedInfo for us.");
				}
			}
		}

		fullFeedList = sortAndTruncateFeedItems(fullFeedList);

		/*
		 * Generate the final presentation info objects to send back to client (NodeInfo
		 * list)
		 */
		List<NodeInfo> results = new LinkedList<NodeInfo>();

		/*
		 * The set of all IDs that were put into any 'NodeInfo.parent' objects in the
		 * loop below
		 */
		HashSet<String> parentIdSet = new HashSet<String>();

		for (UserFeedItem ufi : fullFeedList) {
			SubNode node = ufi.getNode();

			/*
			 * If this node is a parent already, then skip it, becasue it's already known to
			 * be rendering in the output as a parent, and we don't need it showing up
			 * twice.
			 */
			if (node == null || parentIdSet.contains(node.getId().toHexString())) {
				continue;
			}

			NodeInfo info = convert.convertToNodeInfo(sessionContext, session, node, true, false, counter + 1, false,
					false);
			results.add(info);

			/*
			 * If this node is not a direct child of a POSTS (USER_FEED) type node, then
			 * that means it's a reply to someone's post and so we need to lookup the parent
			 * and assign that so the client can render this node with the node it's a reply
			 * to displayed directly above it in the feed
			 */
			if (lookupParent(session, info, node.getPath())) {
				parentIdSet.add(info.getParent().getId());
			}

			if (counter++ > MAX_NODES) {
				break;
			}
		}

		/*
		 * Now to remove a bit of redundancy and make the feed look nicer, we remove any
		 * of the items from 'results' that are in the list some other place as an
		 * 'NodeInfo.parent'
		 */
		List<NodeInfo> filteredResults = results.stream().filter(ninf -> !parentIdSet.contains(ninf.getId()))
				.collect(Collectors.toList());

		res.setSearchResults(filteredResults);
		res.setSuccess(true);
		sessionContext.setFeedUserNodeIds(userNodeIds);

		// log.debug("feed count: " + counter);
		return res;
	}

	public NodeFeedResponse serverFeed(NodeFeedRequest req) {
		return (NodeFeedResponse) adminRunner.run(session -> {
			/*
			 * todo-1: This is TEMPORARY, we will end up keeping userFeedService up to date
			 * another way later. For now we could at least add an admin menu option to run
			 * this on demand ?
			 */
			init();

			NodeFeedResponse res = new NodeFeedResponse();
			int MAX_NODES = 100;
			int counter = 0;

			/*
			 * This collection will hold the merged list of all the Outbox content of all
			 * Friends
			 */
			List<UserFeedItem> fullFeedList = new LinkedList<UserFeedItem>();

			synchronized (UserFeedService.userFeedInfoMapByUserName) {

				for (Map.Entry<String, UserFeedInfo> set : UserFeedService.userFeedInfoMapByUserName.entrySet()) {
					UserFeedInfo userFeed = set.getValue();

					/* if federsted add all userFeed items (adds both foreign users and local users) */
					if ("federated".equals(req.getServerFilter())) {
						// todo-0: this list will have scaling issues on large servers.
						fullFeedList.addAll(userFeed.getUserFeedList());
					}
					/* If local we only add the userFeed items that don't contain "@" in their name which is the 
					we detect foreign server users */
					else {
						for (UserFeedItem ufi : userFeed.getUserFeedList()) {
							if (!ufi.getUserName().contains("@")) {
								fullFeedList.add(ufi);
							}
						}
					}
				}
			}

			/* Sort the feed items chrononologially, reversed with newest on top */
			fullFeedList = sortAndTruncateFeedItems(fullFeedList);

			/*
			 * Generate the final presentation info objects to send back to client (NodeInfo
			 * list)
			 */
			List<NodeInfo> results = new LinkedList<NodeInfo>();

			/*
			 * The set of all IDs that were put into any 'NodeInfo.parent' objects in the
			 * loop below
			 */
			HashSet<String> parentIdSet = new HashSet<String>();

			for (UserFeedItem ufi : fullFeedList) {
				SubNode node = ufi.getNode();

				/*
				 * If this node is a parent already, then skip it, becasue it's already known to
				 * be rendering in the output as a parent, and we don't need it showing up
				 * twice.
				 */
				if (node == null || parentIdSet.contains(node.getId().toHexString())) {
					continue;
				}

				NodeInfo info = convert.convertToNodeInfo(sessionContext, session, node, true, false, counter + 1,
						false, false);
				results.add(info);

				/*
				 * If this node is not a direct child of a POSTS (USER_FEED) type node, then
				 * that means it's a reply to someone's post and so we need to lookup the parent
				 * and assign that so the client can render this node with the node it's a reply
				 * to displayed directly above it in the feed
				 */
				if (lookupParent(session, info, node.getPath())) {
					parentIdSet.add(info.getParent().getId());
				}

				if (counter++ > MAX_NODES) {
					break;
				}
			}

			/*
			 * Now to remove a bit of redundancy and make the feed look nicer, we remove any
			 * of the items from 'results' that are in the list some other place as an
			 * 'NodeInfo.parent'
			 */
			List<NodeInfo> filteredResults = results.stream().filter(ninf -> !parentIdSet.contains(ninf.getId()))
					.collect(Collectors.toList());

			res.setSearchResults(filteredResults);
			res.setSuccess(true);

			// log.debug("feed count: " + counter);
			return res;
		});
	}

	public List<UserFeedItem> sortAndTruncateFeedItems(List<UserFeedItem> list) {
		/* Sort the feed items chrononologially, reversed with newest on top */
		Collections.sort(list, new Comparator<UserFeedItem>() {
			@Override
			public int compare(UserFeedItem s1, UserFeedItem s2) {
				return s2.getModTime().compareTo(s1.getModTime());
			}
		});

		/* Truncate list down to max length */
		if (list.size() > MAX_FEED_ITEMS) {
			list = list.subList(0, MAX_FEED_ITEMS - 1);
		}
		return list;
	}

	/*
	 * This will ensure that 'nodeInfo.parent' is populated if this is a reply to a
	 * post (not a 'root post', i.e. child of a posts node of a use)
	 * 
	 * path should be the 'path' for the node associated with 'nodeInfo' and has to
	 * be passed in separately because we currently dont have 'path' on the actual
	 * nodeInfo object.
	 * 
	 * Returns 'true' only if it set a parent.
	 */
	public boolean lookupParent(MongoSession session, NodeInfo nodeInfo, String path) {

		// log.debug("LookupParent: " + nodeInfo.getContent());

		int lastSlashIdx = path.lastIndexOf("/");

		// if no slashes, we're done
		if (lastSlashIdx <= 0)
			return false;

		String parentPath = path.substring(0, lastSlashIdx);

		/*
		 * If the parent of this node has a userFeedInfo, it's a post parent, so this
		 * nodeInfo is not a reply to a post but is instead an actual root level post,
		 * so we have nothing to do here
		 */
		UserFeedInfo userFeedInfo = userFeedInfoMapByPath.get(parentPath);
		if (userFeedInfo != null) {
			return false;
		}

		boolean ret = false;
		/*
		 * Otherwise we need to find the node at 'parentPath', from memory if we can,
		 * and if not then cached read it and cache it into memory
		 */
		NodeInfo parentNodeInfo = nodeInfoMapByPath.get(parentPath);
		if (parentNodeInfo == null) {
			SubNode parentNode = read.getNode(session, parentPath);
			if (parentNode != null) {
				parentNodeInfo = convert.convertToNodeInfo(sessionContext, session, parentNode, true, false, 0, false,
						false);
				nodeInfoMapByPath.put(parentPath, parentNodeInfo);
			}
		}

		if (parentNodeInfo != null) {
			nodeInfo.setParent(parentNodeInfo);
			ret = true;
		}
		return ret;
	}
}
