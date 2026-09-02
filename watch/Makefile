KEY    := $(HOME)/.garmin/developer_key.der
JUNGLE := monkey.jungle
OUT    := build/SleepClick-$(DEVICE).prg
DEVICE := fr935
SDK    := $(HOME)/opt/connectiq-sdk/bin

.PHONY: build sim deploy clean key

build:
	mkdir -p build
	$(SDK)/monkeyc -f $(JUNGLE) -o $(OUT) -y $(KEY) -d $(DEVICE) -w

sim:
	mkdir -p build
	$(SDK)/monkeyc -f $(JUNGLE) -o $(OUT) -y $(KEY) -d $(DEVICE)sim -w

deploy: build
	@MOUNT=$$(ls -d /media/$$USER/GARMIN /run/media/$$USER/GARMIN /media/GARMIN 2>/dev/null | head -1); \
	if [ -z "$$MOUNT" ]; then \
	  echo "Hodinky nie sú pripojené (hľadal som /media/$$USER/GARMIN a /run/media/$$USER/GARMIN)."; \
	  echo "Skontroluj, že sú v režime USB mass storage: lsblk -o NAME,LABEL,MOUNTPOINT | grep -i garmin"; \
	  exit 1; \
	fi; \
	test -d "$$MOUNT/GARMIN/APPS" || { echo "Na $$MOUNT chýba GARMIN/APPS — je to naozaj disk hodiniek?"; exit 1; }; \
	cp $(OUT) $$MOUNT/GARMIN/APPS/; \
	sync; \
	echo "Nahraté: $(OUT) -> $$MOUNT/GARMIN/APPS/"

clean:
	rm -rf build

key:
	@mkdir -p $(HOME)/.garmin
	@if [ -f $(KEY) ]; then echo "Kluč už existuje: $(KEY)"; exit 0; fi
	openssl genrsa -out $(HOME)/.garmin/developer_key.pem 4096
	openssl pkcs8 -topk8 -inform PEM -outform DER \
	  -in $(HOME)/.garmin/developer_key.pem -out $(KEY) -nocrypt
	@echo "Kluč vygenerovaný: $(KEY)"
