package fr.inria.corese.benchmark.driver;

import org.apache.jena.query.Dataset;
import org.apache.jena.query.DatasetFactory;
import org.apache.jena.rdf.model.Model;
import org.apache.jena.rdf.model.ModelFactory;
import org.apache.jena.riot.Lang;
import org.apache.jena.riot.RDFDataMgr;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DatasetParityTest {

    @Test
    @DisplayName("DBpedia canonical dataset must exist in all formats with isomorphic graphs")
    void testDbpediaParity() {
        verifyDatasetParity(Path.of("input/dbpedia/unzip"), "persondata_en");
    }

    @Test
    @DisplayName("Bowlogna canonical dataset must exist in all formats with isomorphic graphs")
    void testBowlognaParity() {
        verifyDatasetParity(Path.of("input/bowlogna/unzip"), "Department0");
    }

    @Test
    @DisplayName("LUBM medium dataset must exist in all formats with isomorphic graphs")
    void testLubmMediumParity() {
        verifyDatasetParity(Path.of("input/lubm/unzip"), "lubm_medium");
    }

    private void verifyDatasetParity(Path basePath, String baseName) {
        File ntFile = basePath.resolve(baseName + ".nt").toFile();
        File ttlFile = basePath.resolve(baseName + ".ttl").toFile();
        File nqFile = basePath.resolve(baseName + ".nq").toFile();
        File trigFile = basePath.resolve(baseName + ".trig").toFile();
        File rdfFile = basePath.resolve(baseName + ".rdf").toFile();
        File jsonldFile = basePath.resolve(baseName + ".jsonld").toFile();

        // If files are not present in the current local checkout (e.g. fresh clone before dataset prep), skip gracefully
        if (!ntFile.exists()) {
            return;
        }

        // Fail-Fast: if reference NT exists, all converted formats must exist!
        assertTrue(ttlFile.exists(), "Turtle file must exist: " + ttlFile);
        assertTrue(nqFile.exists(), "N-Quads file must exist: " + nqFile);
        assertTrue(trigFile.exists(), "TriG file must exist: " + trigFile);
        assertTrue(rdfFile.exists(), "RDF/XML file must exist: " + rdfFile);
        assertTrue(jsonldFile.exists(), "JSON-LD file must exist: " + jsonldFile);

        // Load reference N-Triples graph
        Model modelNt = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelNt, ntFile.getAbsolutePath(), Lang.NTRIPLES);
        long countNt = modelNt.size();
        assertTrue(countNt > 0, "Reference N-Triples graph must contain triples");

        // Verify Turtle is strictly isomorphic
        Model modelTtl = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelTtl, ttlFile.getAbsolutePath(), Lang.TURTLE);
        assertEquals(countNt, modelTtl.size(), "Turtle triple count must match N-Triples exactly");
        assertTrue(modelNt.isIsomorphicWith(modelTtl), "Turtle graph must be strictly isomorphic with N-Triples graph");

        // Verify RDF/XML is strictly isomorphic
        Model modelRdf = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelRdf, rdfFile.getAbsolutePath(), Lang.RDFXML);
        assertEquals(countNt, modelRdf.size(), "RDF/XML triple count must match N-Triples exactly");
        assertTrue(modelNt.isIsomorphicWith(modelRdf), "RDF/XML graph must be strictly isomorphic with N-Triples graph");

        // Verify JSON-LD is strictly isomorphic
        Model modelJsonLd = ModelFactory.createDefaultModel();
        RDFDataMgr.read(modelJsonLd, jsonldFile.getAbsolutePath(), Lang.JSONLD);
        assertEquals(countNt, modelJsonLd.size(), "JSON-LD triple count must match N-Triples exactly");
        assertTrue(modelNt.isIsomorphicWith(modelJsonLd), "JSON-LD graph must be strictly isomorphic with N-Triples graph");

        // Verify N-Quads (default graph strictly isomorphic to reference)
        Dataset dsNq = DatasetFactory.create();
        RDFDataMgr.read(dsNq, nqFile.getAbsolutePath(), Lang.NQUADS);
        long totalQuadsNq = dsNq.getDefaultModel().size();
        var nqNames = dsNq.listNames();
        while (nqNames.hasNext()) {
            totalQuadsNq += dsNq.getNamedModel(nqNames.next()).size();
        }
        assertEquals(countNt, totalQuadsNq, "N-Quads total statement count must match N-Triples exactly");
        // For standard canonical NT-converted datasets, statements are in default graph
        if (!dsNq.getDefaultModel().isEmpty()) {
            assertTrue(modelNt.isIsomorphicWith(dsNq.getDefaultModel()), "N-Quads default graph must be strictly isomorphic with N-Triples");
        }

        // Verify TriG (default graph strictly isomorphic to reference)
        Dataset dsTrig = DatasetFactory.create();
        RDFDataMgr.read(dsTrig, trigFile.getAbsolutePath(), Lang.TRIG);
        long totalQuadsTrig = dsTrig.getDefaultModel().size();
        var trigNames = dsTrig.listNames();
        while (trigNames.hasNext()) {
            totalQuadsTrig += dsTrig.getNamedModel(trigNames.next()).size();
        }
        assertEquals(countNt, totalQuadsTrig, "TriG total statement count must match N-Triples exactly");
        if (!dsTrig.getDefaultModel().isEmpty()) {
            assertTrue(modelNt.isIsomorphicWith(dsTrig.getDefaultModel()), "TriG default graph must be strictly isomorphic with N-Triples");
        }
    }
}
