package fr.inria.corese.benchmark.driver;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class DriverFactoryTest {
    @Test
    void coreseNextRejectsInference() {
        for (String engine : List.of("corese.next", "corese.local")) {
            var error = assertThrows(UnsupportedOperationException.class,
                    () -> DriverFactory.create(engine, true));
            assertEquals("OWL-RL inference is not supported by CoreseNextDriver", error.getMessage());
        }
    }
}
