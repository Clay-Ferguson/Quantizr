package quanta.service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.core.type.TypeReference;
import quanta.config.ServiceBase;
import quanta.exception.base.RuntimeEx;
import quanta.model.client.SchemaOrgClass;
import quanta.model.client.SchemaOrgProp;
import quanta.model.client.SchemaOrgRange;
import quanta.rest.response.GetSchemaOrgTypesResponse;
import quanta.util.StreamUtil;
import quanta.util.Util;
import quanta.util.XString;

@Component 
public class SchemaOrgService extends ServiceBase {
    private static Logger log = LoggerFactory.getLogger(SchemaOrgService.class);
    private static HashMap<String, Object> schema = null;
    /*
     * We'll keep properties and classes separate rather than doing any containment, because we can
     * always afford to do a brute force thru all properties whenever we need to find the properties in
     * a given class.
     */
    private HashMap<String, SchemaOrgClass> classMap = new HashMap<>();
    private static final ArrayList<SchemaOrgClass> classList = new ArrayList<>();

    @EventListener
    public void handleContextRefresh(ContextRefreshedEvent event) {
        super.handleContextRefresh(event);
        loadJson("classpath:public/schemaorg/schemaorg-all-https.jsonld");
    }

    public void loadJson(String fileName) {
        try {
            Resource resource = context.getResource(fileName);
            InputStream is = resource.getInputStream();
            BufferedReader in = new BufferedReader(new InputStreamReader(is));
            try {
                schema = Util.simpleMapper.readValue(is, new TypeReference<HashMap<String, Object>>() {});
                if (schema == null) {
                    log.debug("schema.org data failed to load.");
                    schema = new HashMap<>();
                } else {
                    parseSchema();
                    // allow classMap to be garbage collected now.
                    classMap = null;
                }
            } finally {
                StreamUtil.close(in);
            }
        } catch (Exception ex) {
            // log and ignore.
            log.error("Failed to load " + fileName, ex);
        }
    }

    private void parseSchema() {
        List<?> graph = (List<?>) schema.get("@graph"); // will be ArrayList<Object>
        if (graph == null)
            return;
        // first scan graph to build classes
        log.debug("Scanning Schema.org Classes.");

        for (Object item : graph) {
            if (item instanceof HashMap mitem) {
                Object type = mitem.get("@type");
                if (type instanceof String o) {
                    switch (o) {
                        case "rdfs:Class":
                            setupClass(mitem);
                            break;
                        default:
                            break;
                    }
                } else {
                    // log.debug("unknown type: " + XString.prettyPrint(item));
                }
            }
        }
        log.debug("Scanning Schema.org Properties.");
        // next we scan again to distribute the properties into all the classes
        for (Object item : graph) {
            if (item instanceof HashMap mitem) {
                Object type = mitem.get("@type");
                if (type instanceof String stype) {
                    switch (stype) {
                        case "rdf:Property":
                            setupProperty(mitem);
                        default:
                            break;
                    }
                } else {
                    // log.debug("unknown type: " + XString.prettyPrint(item));
                }
            }
        }
        classList.sort((n1, n2) -> (int) n1.getLabel().compareTo(n2.getLabel()));

        for (SchemaOrgClass soc : classList) {
            // to simplify and save space we can remove "schema:" prefix from all IDs
            soc.setId(soc.getId().replace("schema:", ""));
            // sort properties
            soc.getProps().sort((n1, n2) -> (int) n1.getLabel().compareTo(n2.getLabel()));
        }
    }

    private void setupClass(HashMap<?, ?> mitem) {
        Object id = mitem.get("@id");
        if (id instanceof String sid) {
            SchemaOrgClass soc = new SchemaOrgClass();
            Object label = mitem.get("rdfs:label");
            String slabel = getStringValue(label);
            Object comment = mitem.get("rdfs:comment");
            String scomment = getStringValue(comment);
            if (slabel == null) {
                throw new RuntimeEx("label not available: " + XString.prettyPrint(mitem));
            }
            soc.setLabel(slabel);
            soc.setId(sid);
            soc.setComment(scomment);
            classMap.put(sid, soc);
            classList.add(soc);
        }
    }

    private String getStringValue(Object label) {
        String slabel = null;
        // handle if string
        if (label instanceof String o) {
            slabel = o;
        } //
        else if (label instanceof HashMap mlabel) { // else try to get @value out of object
            Object val = mlabel.get("@value");
            if (val instanceof String o) {
                slabel = o;
            }
        }
        return slabel;
    }

    private void setupProperty(HashMap<?, ?> prop) {
        SchemaOrgProp sop = new SchemaOrgProp();
        setupDomainIncludes(sop, prop);
        setupRangeIncludes(sop, prop);
        Object comment = prop.get("rdfs:comment");
        String scomment = getStringValue(comment);
        sop.setComment(scomment);
        // and these now have no value either, so remove from memory
        prop.remove("@type");
        prop.remove("schema:source");
    }

    private void setupDomainIncludes(SchemaOrgProp sop, HashMap<?, ?> prop) {
        Object domains = prop.get("schema:domainIncludes");
        // handle if object
        if (domains instanceof HashMap) {
            setupDomainObj(sop, prop, domains);
        } //
        else if (domains instanceof List ldomains) { // handle of list
            for (Object domain : ldomains) {
                if (domain instanceof HashMap) {
                    setupDomainObj(sop, prop, domain);
                }
            }
        } else { // else warning
            log.debug("unable to get domainIncludes from " + XString.prettyPrint(prop));
        }
        // Now that classes are updated we don't need domains to even residen in memory, so blow it away.
        prop.remove("schema:domainIncludes");
    }

    private void setupRangeIncludes(SchemaOrgProp sop, HashMap<?, ?> prop) {
        Object ranges = prop.get("schema:rangeIncludes");
        // handle if object
        if (ranges instanceof HashMap) {
            setupRangeObj(sop, prop, ranges);
        } //
        else if (ranges instanceof List lranges) { // handle of list
            for (Object range : lranges) {
                if (range instanceof HashMap) {
                    setupRangeObj(sop, prop, range);
                }
            }
        } else { // else warning
            log.debug("unable to get domainIncludes from " + XString.prettyPrint(prop));
        }
        // Now that classes are updated we don't need domains to even residen in memory, so blow it away.
        prop.remove("schema:domainIncludes");
    }

    private void setupDomainObj(SchemaOrgProp sop, HashMap<?, ?> prop, Object domain) {
        HashMap<?, ?> mdomain = (HashMap<?, ?>) domain;
        Object domainId = mdomain.get("@id");
        if (domainId instanceof String sdomainId) {
            SchemaOrgClass soc = classMap.get(sdomainId);
            if (soc != null) {
                Object propLabel = prop.get("rdfs:label");
                String slabel = getStringValue(propLabel);
                if (slabel != null) {
                    sop.setLabel(slabel);
                    soc.getProps().add(sop);
                } else {
                    throw new RuntimeEx("Unable to parse 'rdfs:label' from " + XString.prettyPrint(prop));
                }
            }
        }
    }

    private void setupRangeObj(SchemaOrgProp sop, HashMap<?, ?> prop, Object range) {
        HashMap<?, ?> mrange = (HashMap<?, ?>) range;
        Object rangeId = mrange.get("@id");
        if (rangeId instanceof String srangeId) {
            sop.getRanges().add(new SchemaOrgRange(srangeId.replace("schema:", "")));
        }
    }

    public GetSchemaOrgTypesResponse cm_getSchemaOrgTypes() {
        GetSchemaOrgTypesResponse res = new GetSchemaOrgTypesResponse();
        res.setClasses(classList);
        return res;
    }
}
