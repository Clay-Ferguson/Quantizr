package org.subnode.test;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.LinkedList;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.subnode.exception.base.RuntimeEx;
import org.subnode.model.client.PrincipalName;
import org.subnode.mongo.MongoUtil;
import org.subnode.mongo.MongoAuth;
import org.subnode.mongo.MongoCreate;
import org.subnode.mongo.MongoDelete;
import org.subnode.mongo.MongoRead;
import org.subnode.mongo.MongoSession;
import org.subnode.mongo.MongoUpdate;
import org.subnode.mongo.model.SubNode;
import org.subnode.mongo.model.SubNodePropVal;
import org.subnode.service.AttachmentService;
import org.subnode.util.LimitedInputStreamEx;

@Component
public class MongoTest {
	private static final Logger log = LoggerFactory.getLogger(MongoTest.class);

	@Autowired
	private MongoUtil util;

	@Autowired
	private MongoCreate create;

	@Autowired
	private MongoRead read;

	@Autowired
	private MongoUpdate update;

	@Autowired
	private MongoDelete delete;

	@Autowired
	private MongoAuth auth;

	@Autowired
	private AttachmentService attachmentService;

	public void wipeDb(MongoSession session) {
		util.dropAllIndexes(session);
		util.dropCollection(session, SubNode.class);
	}

	public void test() {

		log.debug("*****************************************************************************************");
		log.debug("MongoTest Running!");

		MongoSession adminSession = auth.getAdminSession();
		long expectedCount = read.getNodeCount(adminSession);

		SubNode adminNode = read.getUserNodeByUserName(adminSession, PrincipalName.ADMIN.s());
		if (adminNode == null) {
			throw new RuntimeEx("Unable to find admin user node.");
		}

		// ----------Insert a test node
		SubNode node = create.createNode(adminSession, "/usrx");
		node.setProp("testKey", new SubNodePropVal("testVal"));
		update.save(adminSession, node);
		expectedCount++;
		log.debug("inserted first node.");

		SubNode nodeFoundById = read.getNode(adminSession, node.getId());
		if (nodeFoundById == null) {
			throw new RuntimeEx("Unable to find node by id.");
		}

		SubNode nodeFoundByStrId = read.getNode(adminSession, node.getId().toHexString());
		if (nodeFoundByStrId == null) {
			throw new RuntimeEx("Unable to find node by id: " + node.getId().toHexString());
		}

		node.setProp("testKeyA", new SubNodePropVal("tesetValA"));
		update.save(adminSession, node);
		log.debug("updated first node.");

		String stuffGuyName = "stuffguy";
		SubNode stuffOwnerNode = util.createUser(adminSession, stuffGuyName, "", "passy", true);
		MongoSession stuffSession = MongoSession.createFromNode(stuffOwnerNode);
		expectedCount++;

		SubNode stuffrootNode = create.createNode(stuffSession, "/stuffroot");
		update.save(adminSession, stuffrootNode);
		expectedCount++;
		log.debug("inserted stuffroot node.");

		SubNode stuffNode = create.createNode(stuffSession, "/stuffroot/stuff");
		update.save(adminSession, stuffNode);
		expectedCount++;
		log.debug("inserted stuff node.");

		// ----------Save a node that uses inheritance (SubNode base class)
		// UserPreferencesNode userPrefsNode = api.createUserPreferencesNode(adminSession, "/stuffroot/userPrefs");
		// userPrefsNode.setUserPrefString("my test pref value");
		// api.save(adminSession, userPrefsNode);
		// expectedCount++;
		// log.debug("inserted userPrefs node: " + XString.prettyPrint(userPrefsNode));

		Iterable<SubNode> nodesIter = util.findAllNodes(adminSession);
		util.dump("Dump check", nodesIter);

		// UserPreferencesNode userPrefsNode2 = api.getUserPreference(adminSession, userPrefsNode.getPath());
		// if (userPrefsNode2 == null || !userPrefsNode.getUserPrefString().equals(userPrefsNode2.getUserPrefString())) {
		// 	throw new RuntimeEx("unable to read UserPrefence test object by path");
		// }

		// UserPreferencesNode userPrefsNode3 = api.getUserPreference(adminSession, userPrefsNode.getId());
		// if (userPrefsNode3 == null) {
		// 	throw new RuntimeEx("unable to read UserPrefence test object by ID: " + userPrefsNode.getId());
		// }

		// if (!userPrefsNode.getUserPrefString().equals(userPrefsNode3.getUserPrefString())) {
		// 	throw new RuntimeEx("unable to read UserPrefence test object by ID. Value is not correct.");
		// }

		// ----------Dump current data
		nodesIter = util.findAllNodes(adminSession);
		int count1 = util.dump("Dump after first inserts", nodesIter);
		if (count1 != expectedCount) {
			throw new RuntimeEx("unable to add first records.");
		}

		// ----------Verify getParent works
		SubNode parent = read.getParent(adminSession, stuffNode);
		if (!parent.getPath().equals("/stuffroot")) {
			throw new RuntimeEx("getParent failed.");
		}

		// ----------Verify an attempt to write a duplicate 'path' fails
		boolean uniqueViolationCaught = false;
		try {
			SubNode dupNode = create.createNode(adminSession, "/usrx");
			update.save(adminSession, dupNode);
		}
		catch (Exception e) {
			uniqueViolationCaught = true;
		}

		if (!uniqueViolationCaught) {
			throw new RuntimeEx("Failed to catch unique constraint violation.");
		}

		// ----------Insert a sub-node under the existing node
		log.debug("Inserting children next...");
		long childCount = 5;
		addTestChildren(adminSession, node, childCount);
		expectedCount += childCount;

		// ----------Dump current content before any deletes
		Iterable<SubNode> nodesIter1 = util.findAllNodes(adminSession);
		int count = util.dump("Dumping before any deletes", nodesIter1);
		if (count != expectedCount) {
			throw new RuntimeEx("unable to add child record.");
		}

		readAllChildrenOneByOne(adminSession, node, childCount);

		// ---------Delete one node
		delete.delete(adminSession, node, false);

		// deleted the node AND all children.
		expectedCount -= (1 + childCount);

		// ----------Check that deletion worked
		Iterable<SubNode> nodesIter2 = util.findAllNodes(adminSession);
		count = util.dump("Dump after deletes", nodesIter2);
		if (count != expectedCount) {
			throw new RuntimeEx("unable to delete record, or count is off");
		}

		runBinaryTests(adminSession);

		// api.dropCollection(Node.class);
		log.debug("Mongo Test Ok.");
		log.debug("*****************************************************************************************");
	}

	public void readAllChildrenOneByOne(MongoSession session, SubNode node, long assertCount) {
		log.debug("Getting all children of node at path: " + node.getPath());

		List<Long> ordinalList = new LinkedList<Long>();
		List<ObjectId> idList = new LinkedList<ObjectId>();
		List<String> pathList = new LinkedList<String>();

		/* Make sure we can read the child count from a query */
		long count = read.getChildCount(session, node);
		if (count != assertCount) {
			throw new RuntimeEx("Child count query failed.");
		}
		log.debug("child count query successful.");

		/* check that we can get all the children */
		Iterable<SubNode> childrenIter = read.getChildren(session, node, Sort.by(Sort.Direction.ASC, SubNode.FIELD_ORDINAL), null, 0);
		count = util.dump("Dumping ordered children", childrenIter);

		// ----------Read all ordinals. We don't assume they are all perfectly numbered here. (might
		// be dupliates or missing ones)
		for (SubNode n : childrenIter) {
			ordinalList.add(n.getOrdinal());
		}

		// ---------Read all by indexes.
		for (long i : ordinalList) {
			SubNode n = read.getChildAt(session, node, i);
			if (n == null) {
				throw new RuntimeEx("getChildAt " + i + " failed and returned null.");
			}
			if (n.getOrdinal() != i) {
				throw new RuntimeEx("Ordinal " + n.getOrdinal() + " found when " + i + " was expected.");
			}
			idList.add(n.getId());
			pathList.add(n.getPath());
		}
		log.debug("random access by idx successful.");

		// ---------Read all by IDs.
		for (ObjectId id : idList) {
			SubNode n = read.getNode(session, id);
			if (!n.getId().equals(id)) {
				throw new RuntimeEx("ID " + n.getId() + " found when " + id + " was expected.");
			}
		}
		log.debug("random access by ids successful.");

		// ---------Read all by Paths.
		for (String path : pathList) {
			SubNode n = read.getNode(session, path);
			if (!n.getPath().equals(path)) {
				throw new RuntimeEx("Path " + n.getPath() + " found when " + path + " was expected.");
			}
		}
		log.debug("random access by paths successful.");
	}

	public void runBinaryTests(MongoSession session) {
		log.debug("Running binaries tests.");

		try {
			SubNode node = create.createNode(session, "/binaries");
			update.save(session, node);
			int maxFileSize = session.getMaxUploadSize(); 
			attachmentService.writeStream(session, "", node, new LimitedInputStreamEx(new FileInputStream("/home/clay/test-image.png"), maxFileSize), null, "image/png");
			update.save(session, node);

			log.debug("inserted root for binary testing.", null, "image/png", null);

			InputStream inStream = attachmentService.getStream(session, "", node, true);
			FileUtils.copyInputStreamToFile(inStream, new File("/home/clay/test-image2.png"));
			log.debug("completed reading back the file, and writing out a copy.");
		}
		catch (Exception e) {
			throw new RuntimeEx(e);
		}
	}

	public void addTestChildren(MongoSession session, SubNode node, long count) {
		String parentPath = node.getPath();
		for (int i = 0; i < count; i++) {
			SubNode newNode = create.createNode(session, parentPath + "/subNode" + i);

			/*
			 * we invert ordering 'count-i' (reverse order) so that we can be sure our query testing
			 * for pulling results in order won't accidentally work and is truly ordering in the
			 * query
			 */
			newNode.setOrdinal(count - i - 1);
			update.save(session, newNode);
		}

		Long maxOrdinal = read.getMaxChildOrdinal(session, node);
		if (maxOrdinal == null || maxOrdinal.longValue() != count - 1) {
			throw new RuntimeEx("Expected max ordinal of " + (count - 1) + " but found " + maxOrdinal);
		}
	}
}
