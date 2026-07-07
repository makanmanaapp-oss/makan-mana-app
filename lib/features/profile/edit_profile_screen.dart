import 'dart:io';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/localization/app_localizations.dart';
import '../../core/constants/app_colors.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers.dart';
import '../social/social_providers.dart';

/// ✏️ Edit Profil sosial: gambar, nama paparan, username unik (@handle).
class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() =>
      _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _nameController = TextEditingController();
  final _usernameController = TextEditingController();
  File? _newPhoto;
  String? _currentPhotoUrl;
  bool _loaded = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((timeStamp) {
      final doc = ref.read(myUserDocProvider).value;
      _nameController.text = doc?['displayName'] as String? ?? '';
      _usernameController.text = doc?['username'] as String? ?? '';
      setState(() {
        _currentPhotoUrl = doc?['photoUrl'] as String?;
        _loaded = true;
      });
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 512,
        imageQuality: 85,
      );
      if (picked != null && mounted) {
        setState(() => _newPhoto = File(picked.path));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('😕 $e')));
      }
    }
  }

  Future<void> _save() async {
    final l = AppLocalizations.of(context);
    final uid = ref.read(authRepositoryProvider).currentUser?.uid ?? '';
    setState(() => _saving = true);
    try {
      var photoUrl = '';
      if (_newPhoto != null) {
        final storageRef = FirebaseStorage.instance.ref(
          'profile_images/$uid/avatar.jpg',
        );
        await storageRef
            .putFile(
              _newPhoto!,
              SettableMetadata(contentType: 'image/jpeg'),
            )
            .timeout(const Duration(seconds: 45));
        photoUrl = await storageRef.getDownloadURL();
      }
      await FirebaseFunctions.instanceFor(
        region: AppConstants.functionsRegion,
      )
          .httpsCallable(
            'updateProfile',
            options:
                HttpsCallableOptions(timeout: const Duration(seconds: 20)),
          )
          .call<Map>({
        'displayName': _nameController.text.trim(),
        'username': _usernameController.text.trim(),
        'photoUrl': photoUrl,
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l.t('profileSaved'))),
        );
      }
    } on FirebaseFunctionsException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              e.code == 'already-exists'
                  ? l.t('usernameTaken')
                  : e.message ?? l.t('postFailed'),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('📡 ${l.t('postFailed')}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.t('editProfileTitle'))),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                Center(
                  child: Stack(
                    children: [
                      CircleAvatar(
                        radius: 52,
                        backgroundColor: AppColors.softYellow,
                        backgroundImage: _newPhoto != null
                            ? FileImage(_newPhoto!)
                            : (_currentPhotoUrl != null
                                    ? NetworkImage(_currentPhotoUrl!)
                                    : null)
                                as ImageProvider?,
                        child: _newPhoto == null &&
                                _currentPhotoUrl == null
                            ? const Text('😋',
                                style: TextStyle(fontSize: 44))
                            : null,
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: InkWell(
                          onTap: _saving ? null : _pickPhoto,
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: const BoxDecoration(
                              color: AppColors.primaryRed,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.photo_camera,
                                size: 18, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l.t('displayNameLabel'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _nameController,
                  maxLength: 30,
                  decoration: InputDecoration(
                    hintText: l.t('displayNameHint'),
                    filled: true,
                    fillColor: AppColors.cardWhite,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          const BorderSide(color: AppColors.softBorder),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          const BorderSide(color: AppColors.softBorder),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  l.t('usernameLabel'),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _usernameController,
                  maxLength: 20,
                  decoration: InputDecoration(
                    prefixText: '@',
                    hintText: l.t('usernameHint'),
                    filled: true,
                    fillColor: AppColors.cardWhite,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          const BorderSide(color: AppColors.softBorder),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide:
                          const BorderSide(color: AppColors.softBorder),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(l.t('saveAction')),
                ),
              ],
            ),
    );
  }
}
