package fr.inria.corese.benchmark.telemetry;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class IngestionTelemetrySamplerTest {

    @Test
    void samplerRecordsInitialAndFinalPoints() throws Exception {
        AtomicLong triples = new AtomicLong(0);
        try (IngestionTelemetrySampler sampler = new IngestionTelemetrySampler(20, triples::get)) {
            sampler.start();

            Thread.sleep(60);
            triples.set(500);
            Thread.sleep(60);

            List<TelemetryPoint> points = sampler.stop(1000);

            assertNotNull(points);
            assertTrue(points.size() >= 2, "Expected at least start and end points, got: " + points.size());

            TelemetryPoint first = points.getFirst();
            assertEquals(0L, first.elapsedMs());
            assertEquals(0L, first.triplesLoaded());
            assertTrue(first.heapUsedMb() > 0, "Heap usage must be positive");

            TelemetryPoint last = points.getLast();
            assertTrue(last.elapsedMs() >= 100);
            assertEquals(1000L, last.triplesLoaded());
        }
    }

    @Test
    void samplerRecordsBufferedEnginesAccuratelyWithoutFabricatingData() throws Exception {
        // Simulates an engine that buffers everything until final commit (triples supplier returns 0 during load)
        try (IngestionTelemetrySampler sampler = new IngestionTelemetrySampler(20, () -> 0L)) {
            sampler.start();
            Thread.sleep(80);
            List<TelemetryPoint> points = sampler.stop(10_000);

            assertTrue(points.size() >= 3);
            TelemetryPoint first = points.getFirst();
            assertEquals(0L, first.triplesLoaded());

            // Intermediate points faithfully record 0 without faking an artificial linear curve
            for (int i = 1; i < points.size() - 1; i++) {
                TelemetryPoint p = points.get(i);
                assertEquals(0L, p.triplesLoaded(), "Intermediate samples must not fabricate unmeasured counts");
            }

            TelemetryPoint last = points.getLast();
            assertEquals(10_000L, last.triplesLoaded());
        }
    }

    @Test
    void rejectsInvalidSamplingPeriod() {
        assertThrows(IllegalArgumentException.class, () -> new IngestionTelemetrySampler(0, () -> 0L));
        assertThrows(IllegalArgumentException.class, () -> new IngestionTelemetrySampler(-10, () -> 0L));
    }

    @Test
    void cannotStartTwice() {
        try (IngestionTelemetrySampler sampler = new IngestionTelemetrySampler(50, () -> 0L)) {
            sampler.start();
            assertThrows(IllegalStateException.class, sampler::start);
        }
    }

    @Test
    void cannotStopBeforeStart() {
        try (IngestionTelemetrySampler sampler = new IngestionTelemetrySampler(50, () -> 0L)) {
            assertThrows(IllegalStateException.class, () -> sampler.stop(100));
        }
    }
}
