package fr.inria.corese.benchmark.driver;

import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.riot.Lang;
import org.apache.jena.riot.RDFDataMgr;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DatasetParityTest {

    @Test
    void testBsbmSmallParity() {
        Path basePath = Path.of("input/bsbm/unzip");
        File ntFile = basePath.resolve("bsbm_small.nt").toFile();
        File ttlFile = basePath.resolve("bsbm_small.ttl").toFile();
        File nqFile = basePath.resolve("bsbm_small.nq").toFile();
        File trigFile = basePath.resolve("bsbm_small.trig").toFile();
        File rdfFile = basePath.resolve("bsbm_small.rdf").toFile();
        File jsonldFile = basePath.resolve("bsbm_small.jsonld").toFile();

        if (!ntFile.exists() || !ttlFile.exists() || !nqFile.exists() || !trigFile.exists() || !rdfFile.exists() || !jsonldFile.exists()) {
            return; // Skip if files not yet generated in build environment
        }

        Model modelNt = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelNt, ntFile.getAbsolutePath(), Lang.NTRIPLES);
        long countNt = modelNt.size();

        Model modelTtl = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelTtl, ttlFile.getAbsolutePath(), Lang.TURTLE);
        long countTtl = modelTtl.size();

        Model modelRdf = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelRdf, rdfFile.getAbsolutePath(), Lang.RDFXML);
        long countRdf = modelRdf.size();

        Model modelJsonLd = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelJsonLd, jsonldFile.getAbsolutePath(), Lang.JSONLD);
        long countJsonLd = modelJsonLd.size();

        assertEquals(countNt, countTtl, "Turtle triple count must match N-Triples exactly");
        assertEquals(countNt, countRdf, "RDF/XML triple count must match N-Triples exactly");
        assertEquals(countNt, countJsonLd, "JSON-LD triple count must match N-Triples exactly");
        assertTrue(countNt > 0, "Triple count must be greater than zero");
    }
}
