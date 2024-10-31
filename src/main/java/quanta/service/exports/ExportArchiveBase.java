package quanta.service.exports;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import quanta.config.ServiceBase;
import quanta.exception.base.RuntimeEx;
import quanta.model.TreeNode;
import quanta.model.client.Attachment;
import quanta.model.client.NodeProp;
import quanta.model.client.NodeType;
import quanta.mongo.model.SubNode;
import quanta.rest.request.ExportRequest;
import quanta.rest.response.ExportResponse;
import quanta.util.FileUtils;
import quanta.util.MimeUtil;
import quanta.util.StreamUtil;
import quanta.util.XString;
import quanta.util.val.Val;

/**
 * Base class for exporting to archives (ZIP and TAR).
 *
 * NOTE: Derived classes are expected to be 'prototype' scope so we can keep state in this object on
 * a per-export basis. That is, each time a user does an export, a new instance of this class is
 * created that is dedicated just do doing that one export and so any member varibles in this class
 * have just that one export as their 'scope'
 */
public abstract class ExportArchiveBase extends ServiceBase {
    private static Logger log = LoggerFactory.getLogger(ExportArchiveBase.class);
    private String shortFileName;
    private String fullFileName;
    private String rootPathParent;
    ExportRequest req;
    int baseSlashCount = 0;

    // warnings and issues will be written to 'problems.txt' if there were any issues with the export
    StringBuilder problems = new StringBuilder();

    private class MarkdownLink {
        @SuppressWarnings("unused")
        String description;
        String link;

        MarkdownLink(String description, String link) {
            this.description = description;
            this.link = link;
        }
    }

    /*
     * It's possible that nodes recursively contained under a given node can have same name, so we have
     * to detect that and number them, so we use this hashset to detect existing filenames.
     */
    private final HashSet<String> fileNameSet = new HashSet<>();

    private String docTitle;
    private StringBuilder doc = new StringBuilder();
    private StringBuilder toc = new StringBuilder();

    // markdown links keyed by link url
    private HashMap<String, MarkdownLink> markdownLinks = new HashMap<>();

    private SubNode node;

    public void export(ExportRequest req, ExportResponse res) {
        // for markdown force updateHeadings and Attachments folder
        if (req.getContentType().equals("md")) {
            req.setUpdateHeadings(true);
        }

        this.req = req;
        if (!FileUtils.dirExists(svc_prop.getAdminDataFolder())) {
            throw new RuntimeEx("adminDataFolder does not exist: " + svc_prop.getAdminDataFolder());
        }
        String nodeId = req.getNodeId();
        TreeNode rootNode = svc_mongoRead.getSubGraphTree(nodeId, null, null, null);
        node = rootNode.node;

        String fileName = svc_snUtil.getExportFileName(req.getFileName(), node);
        shortFileName = fileName + "." + getFileExtension();
        fullFileName = svc_prop.getAdminDataFolder() + File.separator + shortFileName;
        baseSlashCount = StringUtils.countMatches(node.getPath(), "/");

        boolean success = false;
        try {
            openOutputStream(fullFileName);
            rootPathParent = node.getParentPath();
            svc_auth.ownerAuth(node);
            ArrayList<SubNode> nodeStack = new ArrayList<>();
            nodeStack.add(node);

            // process the entire exported tree here
            recurseNode("../", "", rootNode, nodeStack, 0, null);
            writeMainFile();

            if (problems.length() > 0) {
                addFileEntry("export-info.txt", problems.toString().getBytes(StandardCharsets.UTF_8));
            }

            res.setFileName(shortFileName);
            success = true;
        } catch (Exception ex) {
            throw new RuntimeEx(ex);
        } finally {
            closeOutputStream();
            if (!success) {
                FileUtils.deleteFile(fullFileName);
            }
        }
    }

    private void writeMainFile() {
        switch (req.getContentType()) {
            case "md":
                writeMarkdownFile();
                break;
            case "html":
                writeHtmlFile();
                break;
            default:
                break;
        }
    }

    private void writeHtmlFile() {
        FlexmarkRender flexmarkRender = new FlexmarkRender();
        String tocIns = flexmarkRender.markdownToHtml(toc.toString());
        String bodyIns = flexmarkRender.markdownToHtml(doc.toString());
        String html = generateHtml(tocIns, bodyIns);
        addFileEntry("index.html", html.toString().getBytes(StandardCharsets.UTF_8));
        addStaticFile("prism.css");
        addStaticFile("prism.js");
    }

    private void addStaticFile(String fileName) {
        addFileEntry(fileName, XString.getResourceAsString(context, "/public/export-includes/html/" + fileName)
                .getBytes(StandardCharsets.UTF_8));
    }

    private String generateHtml(String toc, String body) {
        String templateFile = toc.length() > 0 ? "/public/export-includes/html/html-template-with-toc.html"
                : "/public/export-includes/html/html-template.html";
        String ret = XString.getResourceAsString(context, templateFile);
        ret = ret.replace("/*{{style}}*/",
                XString.getResourceAsString(context, "/public/export-includes/html/style.css"));
        if (toc.length() > 0) {
            ret = ret.replace("{{toc}}", toc);
        }
        if (docTitle != null) {
            ret = ret.replace("{{title}}", docTitle);
        }
        ret = ret.replace("{{body}}", body);
        return ret;
    }

    @SuppressWarnings("rawtypes")
    private void writeMarkdownFile() {
        String content = doc.toString();
        // translate all the links to markdown compatable links
        if (content.contains("](")) {
            Iterator iter = markdownLinks.entrySet().iterator();
            while (iter.hasNext()) {
                Map.Entry entry = (Map.Entry) iter.next();
                MarkdownLink value = (MarkdownLink) entry.getValue();

                String renderLink = value.link;
                // if link.value starts with "/n/" then replace the "/n/" prefix with "#"
                if (value.link.startsWith("/n/")) {
                    renderLink = "#" + value.link.substring(3);
                }
                content = content.replace("](" + value.link + ")", "](" + renderLink + ")");
            }
        }

        if (req.isIncludeToc()) {
            content = toc.toString() + "\n\n" + content;
        }
        addFileEntry("index.md", content.getBytes(StandardCharsets.UTF_8));
    }

    private void recurseNode(String rootPath, String parentFolder, TreeNode tn, ArrayList<SubNode> nodeStack, int level,
            String parentId) {
        SubNode node = tn.node;
        if (node == null)
            return;
        // If a node has a property "noexport" (added by power users) then this node will not be exported.
        String noExport = node.getStr(NodeProp.NO_EXPORT);
        if (noExport != null) {
            return;
        }

        // This is the header row at the top of the page. The rest of the page is children of this node
        boolean doneWithChildren = processNodeExport(parentFolder, "", tn, true, level, true);
        String folder = req.getContentType().equals("fs") ? getFileNameFromNode(node) : node.getIdStr();

        if (!doneWithChildren && tn.children != null) {
            for (TreeNode c : tn.children) {
                boolean noExp = c.node.hasProp(NodeProp.NO_EXPORT.s());
                if (noExp) {
                    continue;
                }

                nodeStack.add(c.node);
                recurseNode(rootPath + "../", parentFolder + "/" + folder, c, nodeStack, level + 1, c.node.getIdStr());
                nodeStack.remove(c.node);
            }
        }
    }

    String concatAllChildren(TreeNode tn) {
        if (tn.children == null || tn.children.size() == 0) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        for (TreeNode c : tn.children) {
            sb.append("\n\n");
            sb.append(c.node.getContent());
        }
        return sb.toString();
    }

    boolean areAllChildrenAreSimpleLeafs(TreeNode tn) {
        if (tn.children == null)
            return true;
        for (TreeNode c : tn.children) {
            if (c.children != null && c.children.size() > 0
                    || (c.node.getAttachments() != null && c.node.getAttachments().size() > 0)) {
                return false;
            }
        }
        return true;
    }

    private String getFileNameFromNode(SubNode node) {
        String folder = getShortNodeText(node.getContent());
        if (StringUtils.isEmpty(folder)) {
            folder = node.getIdStr();
        }

        long ordinal = node.getOrdinal();
        // prefix folder with ordinal number left padded with zeroes to 5 digits
        folder = String.format("%05d", ordinal) + "_" + folder;
        return folder;
    }

    private String getShortNodeText(String content) {
        if (content == null)
            return "";
        content = content.trim();

        // rip off the first line if it's an xml comment
        int firstNLIdx = content.indexOf("\n");
        int endXmlCommentIdx = content.indexOf("-->\n");
        if (endXmlCommentIdx > 0 && firstNLIdx > 0 && endXmlCommentIdx < firstNLIdx) {
            content = content.substring(endXmlCommentIdx + 4);
        }

        String linkName = XString.truncAfterFirst(content, "\n");
        linkName = linkName.trim();
        linkName = XString.repeatingTrimFromFront(linkName, "#");
        linkName = linkName.trim();

        // For any characters in linkName that are not valid for a filename, replace them with a dash
        linkName = linkName.replaceAll("[^a-zA-Z0-9-_]", "-");

        // if linkName length is greater than 60, truncate it
        if (linkName.length() > 60) {
            linkName = linkName.substring(0, 60);

            // Now try to break at the last dash rather than chopping off in the middle of a word
            int lastDash = linkName.lastIndexOf("-");
            if (lastDash > 40) {
                linkName = linkName.substring(0, lastDash);
            }
        }

        linkName = XString.repeatingTrimFromEnd(linkName, "-");
        return linkName.trim();
    }

    /*
     * NOTE: It's correct that there's no finally block in here enforcing the closeEntry, because we let
     * exceptions bubble all the way up to abort and even cause the zip file itself (to be deleted)
     * since it was unable to be written to completely successfully.
     *
     * fileNameCont is an output parameter that has the complete filename minus the period and
     * extension.
     * 
     * Returns true if the children were processed and no further drill down on the tree is needed
     */
    private boolean processNodeExport(String parentFolder, String deeperPath, TreeNode tn, boolean writeFile, int level,
            boolean isTopRow) {
        boolean ret = false;
        try {
            SubNode node = tn.node;
            String concatenatedChildren = "";
            if (req.getContentType().equals("fs")) {
                boolean allChildrenAreLeafs = areAllChildrenAreSimpleLeafs(tn);
                if (allChildrenAreLeafs) {
                    concatenatedChildren = concatAllChildren(tn);
                }
            }

            String content = node.getContent() != null ? node.getContent() : "";
            parseMarkdownLinks(content);
            content = content.trim();

            if (req.isUpdateHeadings()) {
                int lev = getHeadingLevel(node);
                content = svc_edit.translateHeadingsForLevel(content, lev - 1);
            }

            if (writeFile) {
                if (req.isIncludeToc()) {
                    addToTableOfContents(node, level, content);
                }
                if (docTitle == null) {
                    docTitle = extractHeadingText(content);
                }
            }

            List<Attachment> atts = node.getOrderedAttachments();
            // we save off the 'content' into htmlContent, because we need a copy that doesn't have
            // attachments inserted into it for the special case of inserting HTML attachments
            Val<String> contentVal = new Val<>(content);
            String targetFolder = null;

            // if we have a markdown file, all the attachments go into that folder
            if (req.getContentType().equals("md")) {
                targetFolder = "";
            } else {
                targetFolder = "." + parentFolder;
            }

            // Process all attachments just to insert File Tags into content
            if (atts != null) {
                for (Attachment att : atts) {
                    // Process File Tag type attachments here first
                    if (!"ft".equals(att.getPosition())) {
                        continue;
                    }
                    handleAttachment(node, true, contentVal, deeperPath, targetFolder, writeFile, att);
                }
            }

            switch (req.getContentType()) {
                case "md":
                case "html":
                    removeSpecialSyntax(contentVal);
                    break;
                default:
                    break;
            }

            switch (req.getContentType()) {
                case "md":
                    if (doc.length() > 0)
                        doc.append("\n");

                    if (req.isIncludeMetaComments()) {
                        doc.append(buildMarkdownHeader(node));
                    }

                    doc.append(contentVal.getVal());
                    doc.append("\n\n");
                    break;
                case "html":
                    contentVal.setVal(formatContentForHtml(node, contentVal.getVal()));
                    // special handling for htmlContent we have to do this File Tag injection AFTER the html escaping
                    // and processing that's done in the line above
                    if (atts != null) {
                        for (Attachment att : atts) {
                            // Process File Tag type attachments here first
                            if (!"ft".equals(att.getPosition())) {
                                continue;
                            }
                            handleAttachment(node, true, contentVal, deeperPath, targetFolder, writeFile, att);
                        }
                    }

                    if (req.isIncludeToc()) {
                        doc.append("\n<div id='" + node.getIdStr() + "'></div>\n");
                    }
                    doc.append(contentVal.getVal());
                    doc.append("\n\n");
                    break;
                default:
                    break;
            }

            if (atts != null) {
                for (Attachment att : atts) {
                    // Skip File Tag type attachments because they'll already have been processed above
                    if ("ft".equals(att.getPosition())) {
                        continue;
                    }
                    handleAttachment(node, false, null, deeperPath, targetFolder, writeFile, att);
                }
            }

            if (writeFile) {
                if (concatenatedChildren.length() > 0) {
                    content += concatenatedChildren;
                    ret = true; // indicates to calling method we're done drilling down
                }
                writeFilesForNode(parentFolder, node, content, atts);
            }
        } catch (Exception ex) {
            throw new RuntimeEx(ex);
        }
        return ret;
    }

    // Tokenize contentVal into lines and remove any lines that are just a single dash, but leave intact
    // any inside code blocks
    private void removeSpecialSyntax(Val<String> contentVal) {
        String[] lines = contentVal.getVal().split("\n");
        StringBuilder sb = new StringBuilder();
        boolean inCodeBlock = false;
        for (String line : lines) {
            if (line.startsWith("```")) {
                inCodeBlock = !inCodeBlock;
            }

            // Remove the "centering" markdown syntax
            if (line.contains("->") && line.contains("<-")) {
                String temp = line.trim();
                // if line starts with "->" and ends with "<-" then remove those substrings
                if (temp.startsWith("->") && temp.endsWith("<-")) {
                    line = temp.substring(2, temp.length() - 2);
                }
            }

            if (!line.equals("-") || inCodeBlock) {
                sb.append(line);
            }
            sb.append("\n");
        }
        contentVal.setVal(sb.toString().trim());
    }

    private String buildMarkdownHeader(SubNode node) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!-- id:" + node.getIdStr());
        if (StringUtils.isNoneEmpty(node.getName())) {
            sb.append(" name:" + node.getName());
        }
        sb.append(" -->\n");
        return sb.toString();
    }

    private String extractHeadingText(String content) {
        if (content == null)
            return null;
        String headerContent = content.trim();
        if (XString.isMarkdownHeading(headerContent)) {
            // chop string at newline if there's a newline
            int newLineIdx = content.indexOf("\n");
            if (newLineIdx != -1) {
                headerContent = headerContent.substring(0, newLineIdx);
            }
            int firstSpace = headerContent.indexOf(" ");
            if (firstSpace != -1) {
                String heading = headerContent.substring(firstSpace + 1);
                if ("md".equals(req.getContentType()) && !XString.isValidMarkdownHeading(heading)) {
                    problems.append("bad markdown heading: " + heading + "\n");
                }
                return heading;
            }
        }
        return null;
    }

    private void addToTableOfContents(SubNode node, int level, String content) {
        if (req.isIncludeToc()) {
            String heading = extractHeadingText(content);
            if (heading == null)
                return;
            level--;
            int lev = getHeadingLevel(node) - 1;
            String prefix = lev > 0 ? "    ".repeat(lev) : "";
            String target = null;
            switch (req.getContentType()) {
                case "md":
                    target = heading.replace(" ", "-").toLowerCase();
                    break;
                case "html":
                    target = node.getIdStr();
                    break;
                default:
                    break;
            }

            if (node.getIdStr().equals(this.node.getIdStr())) {
                toc.append("#### [" + heading + "](#" + target + ")\n");
            } else {
                toc.append(prefix + "* [" + heading + "](#" + target + ")\n");
            }
        }
    }

    private int getHeadingLevel(SubNode node) {
        int slashCount = StringUtils.countMatches(node.getPath(), "/");
        int lev = slashCount - baseSlashCount;
        if (lev > 6)
            lev = 6;
        return lev;
    }

    private void writeFilesForNode(String parentFolder, SubNode node, String content, List<Attachment> atts) {
        String fileName = getFileNameFromNode(node);
        String json = getNodeJson(node);
        String fullFileName = null;

        switch (req.getContentType()) {
            case "fs":
                fullFileName = parentFolder + "/" + fileName + "/content.md";
                addFileEntry(fullFileName, content.getBytes(StandardCharsets.UTF_8));
                break;
            case "json":
                String id = node.getIdStr();
                fullFileName = parentFolder + "/" + id + "/" + id + ".json";
                addFileEntry(fullFileName, json.getBytes(StandardCharsets.UTF_8));
                break;
            default:
                break;
        }

        if (atts != null) {
            for (Attachment att : atts) {
                writeAttachmentFileForNode(parentFolder, node, fileName, att);
            }
        }
    }

    private String getNodeJson(SubNode node) {
        String json;
        // Pretty print the node having the relative path, and then restore the node to the full path
        String fullPath = node.getPath();
        String relPath = fullPath.substring(rootPathParent.length());
        try {
            node.directSetPath(relPath);
            json = svc_snUtil.toCanonicalJson(node);
        } finally {
            node.directSetPath(fullPath);
        }
        return json;
    }

    private String getAttachmentFileName(Attachment att, SubNode node) {
        String fileName = att.getFileName();

        // we have some possibility of fileName being an actual URL that it was downloaded from so we don't
        // let those be used here and fall back to the key instead
        if (fileName == null || fileName.indexOf("/") != -1) {
            fileName = att.getKey();
        }

        // Some software chokes on spaces in filenames (like VSCode markdown preview), so don't allow that.
        fileName = fileName.replace(" ", "_");
        return fileName;
    }

    private String getAttachmentFileNameEx(Attachment att, SubNode node) {
        String fileName = node.getIdStr() + "_" + att.getKey();
        String attFileName = att.getFileName();

        // try first to get the extension from the filename
        String ext = FilenameUtils.getExtension(attFileName);
        if (!StringUtils.isEmpty(ext)) {
            fileName += "." + ext;
        }
        // if no extension in the filename, try to get it from the mime type
        else {
            // NOTE: this method will retun with the "." in front of the extension
            ext = MimeUtil.getExtensionFromMimeType(att.getMime());
            fileName += ext;
        }
        return fileName;
    }

    private void writeAttachmentFileForNode(String parentFolder, SubNode node, String path, Attachment att) {
        if (att.getMime() == null)
            return;
        String ext = null;
        String attFileName = null;

        switch (req.getContentType()) {
            case "fs":
                attFileName = getAttachmentFileName(att, node);
                ext = FilenameUtils.getExtension(attFileName);
                if (!StringUtils.isEmpty(ext)) {
                    ext = "." + ext;
                } else {
                    ext = MimeUtil.getExtensionFromMimeType(att.getMime());
                    attFileName += ext;
                }
                break;
            case "json":
                attFileName = att.getKey();
                break;
            default:
                attFileName = getAttachmentFileNameEx(att, node);
                break;
        }

        InputStream is = null;
        try {
            is = svc_attach.getStream(att.getKey(), node);
            if (is == null)
                return;
            BufferedInputStream bis = new BufferedInputStream(is);
            long length = att != null ? att.getSize() : null;

            String binFileName = null;

            switch (req.getContentType()) {
                case "md":
                case "html":
                    binFileName = "/attachments/" + attFileName;
                    break;
                default:
                    String folder = req.getContentType().equals("fs") ? path : node.getIdStr();
                    binFileName = parentFolder + "/" + folder + "/" + attFileName;
                    break;
            }

            if (length > 0) {
                // NOTE: the archive WILL fail if no length exists in this codepath
                addFileEntry(binFileName, bis, length);
            } else {
                /*
                 * This *should* never happen that we fall back to writing as an array from the input stream because
                 * normally we will always have the length saved on the node. But are trying to be as resilient as
                 * possible here falling back to this rather than failing the entire export
                 */
                addFileEntry(binFileName, IOUtils.toByteArray(bis));
            }
        } catch (Exception e) {
            throw new RuntimeEx(e);
        } finally {
            StreamUtil.close(is);
        }
    }

    /*
     * If 'content' is passes as non-null then the ONLY thing we do is inject any File Tags onto that
     * content and return the content
     */
    private void handleAttachment(SubNode node, boolean injectingTag, Val<String> content, String deeperPath,
            String parentFolder, boolean writeFile, Attachment att) {
        String nodeId = node.getIdStr();

        String af = getAttachmentFileName(att, node);
        String ext = FilenameUtils.getExtension(af);
        if (!StringUtils.isEmpty(ext)) {
            ext = "." + ext;
        } else {
            ext = MimeUtil.getExtensionFromMimeType(att.getMime());
        }
        String displayName = att.getFileName() != null ? att.getFileName() : af;
        String mimeType = att.getMime();
        String fullUrl = null;

        switch (req.getContentType()) {
            case "md":
            case "html":
                fullUrl = "attachments/" + getAttachmentFileNameEx(att, node);
                break;
            default:
                break;
        }

        String relPath = writeFile ? "" : (nodeId + "/");
        String url = att.getUrl();

        // if no exernal link, this is a local file so build path to it.
        if (url == null) {
            url = "./" + deeperPath + relPath + att.getKey() + ext;
        } else {
            displayName = "Image";
            fullUrl = url;
        }

        if (mimeType == null)
            return;

        if (mimeType.startsWith("image/")) {
            switch (req.getContentType()) {
                case "html":
                case "md":
                    String mdLink = null;
                    if (att.getCssSize() != null
                            && (att.getCssSize().endsWith("%") || att.getCssSize().endsWith("px"))) {
                        mdLink = "\n<img src='" + fullUrl + "' style='width:" + att.getCssSize() + "'/>\n\n";
                    } else {
                        mdLink = "\n![" + displayName + "](" + fullUrl + ")\n\n";
                    }
                    processMdAtt(injectingTag, content, att, mdLink);
                    break;
                default:
                    break;
            }
        } else {
            switch (req.getContentType()) {
                case "html":
                case "md":
                    String mdLink = "\n[" + displayName + "](" + fullUrl + ")\n";
                    processMdAtt(injectingTag, content, att, mdLink);
                    break;
                default:
                    break;
            }
        }
    }

    private void processMdAtt(boolean injectingTag, Val<String> content, Attachment att, String mdLink) {
        if (injectingTag) {
            if (content != null) {
                content.setVal(insertMdLink(content.getVal(), att, mdLink));
            }
        } else {
            if (req.getContentType().equals("md") || req.getContentType().equals("html")) {
                doc.append(mdLink);
            }
        }
    }

    private String insertMdLink(String content, Attachment att, String mdLink) {
        if ("ft".equals(att.getPosition())) {
            content = content.replace("{{" + att.getFileName() + "}}", mdLink);
        }
        return content;
    }

    // todo-0: we should be able to bring this back in a way that works for ALL images, so we can simply
    // add a chunk of JS to the exported HTML that makes this happen
    //
    // private String appendImgLink(String nodeId, String binFileNameStr, String url, Attachment att) {
    // String domId = "img_" + nodeId + "_" + att.getKey();
    // String style = "";
    // if (att.getCssSize() != null && (att.getCssSize().endsWith("%") ||
    // att.getCssSize().endsWith("px"))) {
    // style = "style='width:" + att.getCssSize() + "'";
    // }
    // return ("<div class='attachment'><img title='" + binFileNameStr + "' id='" + domId + "' " + style
    // + " onclick='document.getElementById(\"" + domId + "\").style.width=\"100%\"' src='" + url
    // + "'/></div>");
    // }

    private String formatContentForHtml(SubNode node, String content) {
        if (node.isType(NodeType.PLAIN_TEXT)) {
            return "\n```\n" + content + "\n```\n";
        } else {
            String prefix = "";
            if (req.isDividerLine()) {
                prefix += "\n----\n";
            }

            // If ToC is included the IDs will already be in a DIV tag as the ID, so we don't need it here also.
            if (req.isIncludeIDs() && !req.isIncludeToc()) {
                prefix += "\n<!-- ID:" + node.getIdStr() + " -->\n";
            }
            return prefix + "\n" + content + "\n";
        }
    }

    private void addFileEntry(String fileName, byte[] bytes) {
        // If we have duplicated a filename, number it sequentially to create a unique file
        if (fileNameSet.contains(fileName)) {
            int idx = 1;
            String numberedFileName = fileName + String.valueOf(idx);

            while (fileNameSet.contains(numberedFileName)) {
                numberedFileName = fileName + String.valueOf(++idx);
            }
            fileName = numberedFileName;
        }
        fileNameSet.add(fileName);
        addEntry(fileName, bytes);
    }

    private void addFileEntry(String fileName, InputStream is, long length) {
        if (length <= 0) {
            throw new RuntimeEx("length is required");
        }
        // If we have duplicated a filename, number it sequentially to create a unique file
        if (fileNameSet.contains(fileName)) {
            int idx = 1;
            String numberedFileName = fileName + String.valueOf(idx);

            while (fileNameSet.contains(numberedFileName)) {
                numberedFileName = fileName + String.valueOf(++idx);
            }
            fileName = numberedFileName;
        }
        fileNameSet.add(fileName);
        addEntry(fileName, is, length);
    }

    public void parseMarkdownLinks(String mkdown) {
        // Regex pattern to match the Markdown links
        String regex = "\\[([^\\]]+)\\]\\(([^\\)]+)\\)";

        // Compile the regex pattern
        Pattern pattern = Pattern.compile(regex);

        // Match the pattern in the mkdown string
        Matcher matcher = pattern.matcher(mkdown);

        while (matcher.find()) {
            // Extract the description and link
            String description = matcher.group(1);
            String link = matcher.group(2);

            if (link.startsWith("/")) {
                markdownLinks.put(link, new MarkdownLink(description, link));
            }
        }
    }

    public abstract String getFileExtension();

    public abstract void openOutputStream(String fileName);

    public abstract void closeOutputStream();

    public abstract void addEntry(String fileName, byte[] bytes);

    public abstract void addEntry(String fileName, InputStream stream, long length);
}
