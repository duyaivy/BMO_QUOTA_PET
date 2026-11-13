#include "navigation.h"
#include "mqtt_client.h"
#include "wifi_manager.h"
#include "power_manager.h"

BMONavigationController navigation;

BMONavigationController::BMONavigationController()
    : _mode(UIMode::PET_FACE),
      _quotaIndex(0),
      _endOfListEnteredAt(0) {}

void BMONavigationController::begin() {
    _mode = UIMode::PET_FACE;
    _quotaIndex = 0;
    Serial.println("[NAV] Navigation initialized. Default mode: BMO Face (Pet Home)");
}

void BMONavigationController::update() {
    buttonManager.update();

    if (buttonManager.wasClicked(ButtonId::BUTTON_A)) {
        powerManager.resetActivityTimer();
        handleButtonA();
    }

    if (buttonManager.wasClicked(ButtonId::BUTTON_B)) {
        powerManager.resetActivityTimer();
        handleButtonB();
    }

    // Empty lists also show a bounded notification before returning home.
    if (_mode == UIMode::QUOTA_VIEW && mqttClient.getTotalQuotaPages() == 0) {
        _mode = UIMode::END_OF_LIST;
        _endOfListEnteredAt = millis();
    }
    if (_mode == UIMode::END_OF_LIST) {
        if (END_OF_LIST_AUTO_WRAP_MS > 0 && millis() - _endOfListEnteredAt > END_OF_LIST_AUTO_WRAP_MS) {
            Serial.println("[NAV] End of list timeout reached. Returning to face.");
            _mode = UIMode::PET_FACE;
            _quotaIndex = 0;
        }
    }
}

void BMONavigationController::handleButtonA() {
    if (_mode == UIMode::PET_FACE) {
        // Already on Face screen: cycle through all registered pet scenes
        faceRenderer.nextFace();
        Serial.printf("[NAV] Button A pressed: Cycled face to '%s' (%d/%d)\n",
                      faceRenderer.getFaceName(faceRenderer.getCurrentFace()),
                      (int)faceRenderer.getCurrentFace() + 1,
                      FACE_COUNT);
    } else {
        // In Quota view or End-of-List: switch back to BMO Face mode
        _mode = UIMode::PET_FACE;
        Serial.println("[NAV] Button A pressed: Switched to BMO Face mode.");
    }
}

void BMONavigationController::handleButtonB() {
    uint8_t totalPages = mqttClient.getTotalQuotaPages();

    if (_mode == UIMode::PET_FACE) {
        // Switched from Face mode to Quota mode
        if (totalPages == 0) {
            _mode = UIMode::QUOTA_VIEW;
            _quotaIndex = 0;
            Serial.println("[NAV] Button B pressed: Entering Quota mode (no quota configured).");
        } else {
            _mode = UIMode::QUOTA_VIEW;
            _quotaIndex = 0;
            Serial.printf("[NAV] Button B pressed: Showing Quota screen [1/%d]\n", totalPages);
        }
    } else if (_mode == UIMode::QUOTA_VIEW) {
        if (totalPages <= 1) {
            // Only 1 or 0 screens: immediate transition to End of List
            _mode = UIMode::END_OF_LIST;
            _endOfListEnteredAt = millis();
            _quotaIndex = 0;
            Serial.println("[NAV] Button B pressed: Reached end of quota screens. Showing END_OF_LIST screen.");
        } else {
            _quotaIndex++;
            if (_quotaIndex >= totalPages) {
                // Reached the end of quota list!
                _mode = UIMode::END_OF_LIST;
                _endOfListEnteredAt = millis();
                _quotaIndex = 0;
                Serial.println("[NAV] Button B pressed: Reached end of quota screens. Showing END_OF_LIST screen.");
            } else {
                Serial.printf("[NAV] Button B pressed: Showing Quota screen [%d/%d]\n",
                              _quotaIndex + 1, totalPages);
            }
        }
    } else if (_mode == UIMode::END_OF_LIST) {
        // Button B pressed again on End of List: loop back to first quota screen
        _mode = UIMode::QUOTA_VIEW;
        _quotaIndex = 0;
        Serial.println("[NAV] Button B pressed on End of List: Restarting from Quota screen [1].");
    }
}

void BMONavigationController::render() {
    switch (_mode) {
        case UIMode::PET_FACE:
            faceRenderer.render(display.getDriver());
            display.update();
            break;

        case UIMode::QUOTA_VIEW:
            quotaRenderer.renderQuotaScreen(_quotaIndex, connManager.isWifiConnected(), mqttClient.isConnected());
            break;

        case UIMode::END_OF_LIST:
            if (mqttClient.getTotalQuotaPages() == 0) display.showEmptyQuotaScreen();
            else display.showEndOfListScreen();
            break;
    }
}
